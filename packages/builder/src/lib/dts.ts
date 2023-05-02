import {
  forEachChild,
  sys,
  parseConfigFileTextToJson,
  parseJsonConfigFileContent,
  SyntaxKind,
  createCompilerHost,
  createProgram,
  createSourceFile,
  ScriptTarget
} from 'typescript'
import type {
  SourceFile,
  Node,
  Diagnostic,
  CompilerOptions,
  ImportDeclaration,
  ExternalModuleReference,
  StringLiteral,
  ExportAssignment,
  ExportDeclaration,
  ModuleDeclaration,
  LiteralExpression
} from 'typescript'
import { getDir, merge, normalize, resolve, resolver } from './paths'
import { type WriteStream, createWriteStream, readFile, pathExists, mkdirp } from 'fs-extra'
import { type IPathResolver } from '../interfaces'
import { minimatch } from 'minimatch'
import EventEmitter from 'events'

const EOL = '\n'
const DTSLEN = '.d.ts'.length

interface IDtsWriterOptions {
  main?: string
  name: string

  references?: []
  // exclude files
  excludedPatterns?: string[]
  // return empty string '' to ignore module
  resolvedModule?: (resolution: IModuleResolution) => string
  // return empty string '' to ignore module
  resolvedImport?: (resolution: IModuleImportResolution) => string
}

interface IModuleResolution {
  currentModule: string
}

interface IModuleImportResolution {
  currentModule: string
  importedModule: string
  isExternal?: boolean
}

interface IGenerateOptions {
  // name of package
  name: string
  // input directory to list files
  inputDir: string
  // optional, main module, default is /index
  main?: string
  // path to locate tsconfig.json file
  // if it's not located in inputDir
  projectPath?: string
  // optional, path to place index.d.ts file
  // if omitted, index.d.ts file will be placed inside input dir
  outputPath?: string
  // optional, list of files
  // if omitted, the full list of files will be loaded
  // from parsed ts configuration
  files?: string[]
}

export class Dts extends EventEmitter {
  async generate ({
    name,
    main,
    inputDir,
    projectPath,
    outputPath,
    files = []
  }: IGenerateOptions) {
    let compilerOptions: CompilerOptions = {}
    const inDir = resolver(inputDir)
    const outDir = outputPath ? resolver(outputPath).dir() : inDir

    outputPath = outputPath || inDir.resolve('index.d.ts')

    this.emit('log', `[dts] generate for ${inputDir} > ${outputPath}`)

    /* following tsc behaviour, if a project is specified, or if no files are specified then
    * attempt to load tsconfig.json */
    if (!files.length || projectPath) {
      // if project isn't specified, use baseDir.  If it is and it's a directory,
      // assume we want tsconfig.json in that directory.  If it is a file, though
      // use that as our tsconfig.json.  This allows for projects that have more
      // than one tsconfig.json file.
      const tsConfig = await this.getTsConfig(inputDir, projectPath)

      files = tsConfig.fileNames
      compilerOptions = tsConfig.compilerOptions
    }

    // use input values if tsconfig leaves any of these undefined.
    // this is for backwards compatibility
    compilerOptions.declaration = true
    compilerOptions.target = compilerOptions.target || ScriptTarget.Latest // is this necessary?
    // compilerOptions.moduleResolution = compilerOptions.moduleResolution
    compilerOptions.outDir = compilerOptions.outDir || outDir.rootPath

    // TODO should compilerOptions.baseDir come into play?
    const writeInputDir = resolver(compilerOptions.rootDir || projectPath || inDir.rootPath)
    const writeOutputDir = compilerOptions.outDir || outDir.rootPath
    const generatedFiles = inDir.resolveList(files)

    const params = [
      `baseDir = "${writeInputDir.rootPath}"`,
      `target = ${compilerOptions.target.toString()}`,
      `outDir = ${writeOutputDir || ''}`,
      `rootDir = ${compilerOptions.rootDir || ''}`,
      `moduleResolution = ${compilerOptions.moduleResolution?.toString() || ''}`,
      'files =',
      ...generatedFiles.map(file => `  ${file}`)
    ]

    this.emit(
      'log:verbose',
      '[dts] params:\n' + params.map(p => `  ${p}`).join('\n')
    )

    await mkdirp(getDir(outputPath))
    const writer = new DtsWriter({
      name,
      main
    })

    writer.on('log', msg => this.emit('log', msg))
    writer.on('log:verbose', msg => this.emit('log:verbose', msg))

    await writer.write(
      writeInputDir.rootPath,
      outputPath,
      compilerOptions,
      generatedFiles
    )
  }

  async getTsConfig (inputDir: string, projectPath?: string) {
    const inDir = resolver(inputDir)
    const tsconfigFiles = [
      projectPath && resolver(projectPath).resolve('tsconfig.json'),
      projectPath, // if projectPath is location of tsconfig.json
      inDir.resolve('tsconfig.json')
    ].filter(Boolean) as string[]

    for await (const tsconfigFile of tsconfigFiles) {
      if (await pathExists(tsconfigFile)) {
        this.emit('log', `[dts] tsconfig from ${tsconfigFile}`)

        return await parseTsConfig(tsconfigFile)
      }
    }

    throw Error(`Can't find tsconfig in ${projectPath || inDir.rootPath}`)
  }
}

export class DtsWriter extends EventEmitter {
  private readonly ident = '  '
  private readonly options: IDtsWriterOptions

  private externalModules: string[] = []
  private outDir?: IPathResolver
  private output?: WriteStream

  constructor (options: IDtsWriterOptions) {
    super()

    this.options = {
      main: '/index',
      references: [],
      excludedPatterns: [
        '**/node_modules/**/*.d.ts',
        '**/.yarn/**/*.d.ts'
      ],
      ...options
    }
  }

  async write (
    inputDir: string,
    outputPath: string,
    compilerOptions: CompilerOptions,
    filePaths: string[],
    options?: Partial<IDtsWriterOptions>
  ) {
    this.externalModules = []

    this.emit('log', '[dtsw] start')
    const host = createCompilerHost(compilerOptions)
    const program = createProgram(filePaths, compilerOptions, host)
    const sourceFiles = program.getSourceFiles()

    this.listExternals(sourceFiles)

    const outDir = resolver(outputPath).dir()

    this.outDir = outDir
    this.output = createWriteStream(outputPath, { mode: parseInt('644', 8) })
    let mainExportDeclaration = false
    let mainExportAssignment = false
    // let mainFound = false

    const inDir = resolver(inputDir)

    this.emit('log', '[dtsw] process files')
    sourceFiles.some(sourceFile => {
      const filePath = normalize(sourceFile.fileName)

      // Source file is a default library, or other dependency from another project, that should not be included in
      // our bundled output
      if (!inDir.includes(filePath)) {
        this.emit('log:verbose', `[dtsw] process: ignored library ${filePath}`)

        return false // continue
      }

      if (this.options.excludedPatterns?.some(pattern => minimatch(filePath, pattern))) {
        this.emit('log:verbose', `[dtsw] process: excluded ${filePath}`)

        return false // continue
      }

      // Source file is already a declaration file so should does not need to be pre-processed by the emitter
      if (filePath.slice(-DTSLEN) === '.d.ts') {
        this.emit('log:verbose', `[dtsw] process: d.ts ${filePath}`)
        this.writeDeclaration(sourceFile)

        return false // continue
      }

      const resolvedModuleId = this.resolveModule({
        currentModule: inDir.relative(removeExtension(sourceFile.fileName))
      })

      // We can optionally output the main module if there's something to export.
      if (options?.main === resolvedModuleId) {
        // mainFound = true
        forEachChild(sourceFile, node => {
          mainExportDeclaration = mainExportDeclaration || NodeKinds.isExportDeclaration(node)
          mainExportAssignment = mainExportAssignment || NodeKinds.isExportAssignment(node)
        })
      }

      const emitOutput = program.emit(sourceFile, (filePath: string, data: string) => {
        // Compiler is emitting the non-declaration file, which we do not care about
        if (filePath.slice(-DTSLEN) !== '.d.ts') {
          this.emit('log:verbose', `[dtsw] process: ignored d.ts ${filePath}`)

          return
        }

        this.emit('log:verbose', `[dtsw] process: ts ${filePath}`)
        this.writeDeclaration(createSourceFile(filePath, data, compilerOptions.target as any, true))
      })

      if (emitOutput.emitSkipped || emitOutput.diagnostics.length > 0) {
        this.emit('log:verbose', `[dtsw] process: ts ${filePath} error`)
        throw getTsError(
          emitOutput.diagnostics
            .concat(program.getSemanticDiagnostics(sourceFile))
            .concat(program.getSyntacticDiagnostics(sourceFile))
            .concat(program.getDeclarationDiagnostics(sourceFile))
        )
      }

      return false // continue
    })

    // if (options.main && mainFound) {
    //   this.writeOutput(`declare module '${options.name}' {`, 1)
    //   if (compilerOptions.target as ScriptTarget >= ScriptTarget.ES2015) {
    //     if (mainExportAssignment) {
    //       this.writeOutput(`export {default} from '${options.main}';`)
    //     }
    //     if (mainExportDeclaration) {
    //       this.writeOutput(`export * from '${options.main}';`)
    //     }
    //   } else {
    //     this.writeOutput(`import main = require('${options.main}');`)
    //     this.writeOutput('export = main;')
    //   }

    //   this.writeOutput('}', -1)
    // }

    this.output.close()
    this.emit('log', '[dts] done')
  }

  private listExternals (declarationFiles: readonly SourceFile[]) {
    this.emit('log', '[dtsw] list externals')
    declarationFiles.forEach(sourceFile => {
      processTree(sourceFile, (node: Node) => {
        if (NodeKinds.isModuleDeclaration(node)) {
          const name = node.name

          if (NodeKinds.isStringLiteral(name)) {
            this.externalModules.push(name.text)
          }
        }

        return undefined
      })
    })

    if (!this.externalModules.length) {
      this.emit('log:verbose', '[dtsw] list externals: no externals found')
    } else {
      this.emit('log:verbose', [
        '[dtsw] list externals:',
        ...this.externalModules.map(name => `  - ${name}`)
      ].join('\n'))
    }
  }

  private writeDeclaration (declarationFile: SourceFile) {
    if (!this.outDir) {
      throw Error('[dtsw] output dir not provided')
    }

    const filePath = resolve(declarationFile.fileName)
    const currentModule = removeExtension(this.outDir.relative(filePath))

    if ((declarationFile as any).externalModuleIndicator) {
      this.writeExternalModuleDeclaration(declarationFile, currentModule)
    } else {
      if (currentModule === '../tests/mocks/mockScript') {
        console.log(declarationFile.text)
      }

      this.emit('log', `[dtsw] declare ${currentModule} from text`)
      this.writeOutput(declarationFile.text)
      this.emit('log:verbose', `[dtsw] declare ${currentModule} done`)
    }
  }

  private writeExternalModuleDeclaration (declarationFile: SourceFile, currentModule: string) {
    const resolvedModuleId = this.resolveModule({ currentModule })

    this.emit('log', `[dtsw] declare:external ${resolvedModuleId} (${declarationFile.fileName})`)

    const content = processTree(declarationFile, (node: Node) => {
      if (NodeKinds.isExternalModuleReference(node)) {
        const expression = node.expression as LiteralExpression

        // convert both relative and non-relative module names in import = require(...)
        const resolvedImportedModule: string = this.resolveImport({
          importedModule: expression.text,
          currentModule
        })

        this.emit('log:verbose', `[dtsw] declare:external ${resolvedModuleId}: require ${resolvedImportedModule}`)

        return ` require('${resolvedImportedModule}')`
      } else if (NodeKinds.isDeclareKeyWord(node)) {
        this.emit('log:verbose', `[dtsw] declare:external ${resolvedModuleId}: ignored declare keyword`)

        return ''
      } else if (
        NodeKinds.isStringLiteral(node) && node.parent &&
        (NodeKinds.isExportDeclaration(node.parent) || NodeKinds.isImportDeclaration(node.parent))
      ) {
        // This block of code is modifying the names of imported modules
        const text = node.text
        const resolvedImportedModule: string = this.resolveImport({
          importedModule: text,
          currentModule
        })

        if (resolvedImportedModule) {
          this.emit('log:verbose', `[dtsw] declare:external ${resolvedModuleId}: import ${resolvedImportedModule}`)

          return ` '${resolvedImportedModule}'`
        }
      }

      return undefined
    })

    const declarationLines = content.join('')
      .split('\n')
      .filter(line => line && line !== 'export {};')

    this.writeDeclarationOutput(resolvedModuleId, declarationLines)
    this.emit('log:verbose', `[dtsw] declare:external ${resolvedModuleId} done`)
  }

  private writeOutput (message: string, postIdentChange = 0) {
    if (!this.output) {
      throw Error('[dtsw] output stream not set')
    }

    this.output.write(message + EOL)
  }

  private writeDeclarationOutput (name: string, lines: string[] = []) {
    if (!lines.length) {
      return
    }

    this.writeOutput(`declare module '${name}' {`)
    this.writeOutput(lines.map(line => `${this.ident}${line}`.replace(/\s{4}/g, this.ident)).join(EOL))
    this.writeOutput('}')
  }

  private resolveModule (resolution: IModuleResolution) {
    // TODO
    let resolvedId = resolution.currentModule

    if (this.options.resolvedModule) {
      resolvedId = this.options.resolvedModule(resolution) || resolvedId
    } else {
      resolvedId = resolvedId.replace(/^.+\/src/, 'src')
    }

    resolvedId = `${this.options.name}/${resolvedId}`

    this.emit('log:verbose', `[dtsw] resolve ${resolvedId} (${resolution.currentModule})`)

    return resolvedId
  }

  private resolveImport (resolution: IModuleImportResolution) {
    const isExternal: boolean = this.externalModules.includes(resolution.importedModule) ||
      !/^\./.test(resolution.importedModule)
    const importedModule = !isExternal
      ? merge(getDir(resolution.currentModule), resolution.importedModule)
      : resolution.importedModule

    let resolvedId: string = importedModule

    if (this.options.resolvedImport) {
      resolvedId = this.options.resolvedImport({
        currentModule: resolution.currentModule,
        importedModule,
        isExternal
      }) || resolvedId
    } else {
      resolvedId = resolvedId.replace(/^.+\/src/, 'src')
    }

    resolvedId = !isExternal
      ? `${this.options.name}/${resolvedId}`
      : resolvedId

    this.emit('log:verbose', `[dtsw] resolve:import ${resolvedId}${isExternal ? ' (external)' : ''} (${resolution.currentModule}, ${resolution.importedModule})`)

    return resolvedId
  }
}

export const NodeKinds = {
  isDeclareKeyWord (node: Node): node is ImportDeclaration {
    return node && node.kind === SyntaxKind.DeclareKeyword
  },
  isImportDeclaration (node: Node): node is ImportDeclaration {
    return node && node.kind === SyntaxKind.ImportDeclaration
  },
  isExternalModuleReference (node: Node): node is ExternalModuleReference {
    return node && node.kind === SyntaxKind.ExternalModuleReference
  },
  isStringLiteral (node: Node): node is StringLiteral {
    return node && node.kind === SyntaxKind.StringLiteral
  },
  isExportDeclaration (node: Node): node is ExportDeclaration {
    return node && node.kind === SyntaxKind.ExportDeclaration
  },
  isExportAssignment (node: Node): node is ExportAssignment {
    return node && node.kind === SyntaxKind.ExportAssignment
  },
  isModuleDeclaration (node: Node): node is ModuleDeclaration {
    return node && node.kind === SyntaxKind.ModuleDeclaration
  }
}

type IReplacer = (node: Node) => string | undefined
const processTree = (sourceFile: SourceFile, replacer: IReplacer): string[] => {
  const codes: string[] = []
  let cursorPosition = 0

  function skip (node: Node) {
    cursorPosition = node.end
  }

  function readThrough (node: Node) {
    codes.push(sourceFile.text.slice(cursorPosition, node.pos))
    cursorPosition = node.pos
  }

  function visit (node: Node) {
    readThrough(node)

    const replacement = replacer(node)

    if (replacement !== undefined) {
      codes.push(replacement)
      skip(node)
    } else {
      forEachChild(node, visit)
    }
  }

  visit(sourceFile)
  codes.push(sourceFile.text.slice(cursorPosition))

  return codes.filter(Boolean)
}

/**
 * Load and parse a TSConfig File
 * @param options The dts-generator options to load config into
 * @param fileName The path to the file
 */
const parseTsConfig = async (fileName: string): Promise<{
  fileNames: string[]
  compilerOptions: CompilerOptions
}> => {
  // TODO this needs a better design than merging stuff into options.
  // the trouble is what to do when no tsconfig is specified...

  const configText = await readFile(fileName, { encoding: 'utf8' })
  const result = parseConfigFileTextToJson(fileName, configText)

  if (result.error) {
    throw getTsError([result.error])
  }
  const configObject = result.config
  const configParseResult = parseJsonConfigFileContent(configObject, sys, getDir(fileName))

  if (configParseResult.errors?.length) {
    throw getTsError(configParseResult.errors)
  }

  return {
    fileNames: configParseResult.fileNames,
    compilerOptions: configParseResult.options
  }
}

/**
 * A helper that takes TypeScript diagnostic errors and returns an error
 * object.
 * @param diagnostics The array of TypeScript Diagnostic objects
 */
const getTsError = (diagnostics: Diagnostic[]) => {
  const messages = ['Declaration generation failed']

  diagnostics.forEach(diagnostic => {
    const messageText = typeof diagnostic.messageText === 'string'
      ? diagnostic.messageText
      : diagnostic.messageText.messageText

    // not all errors have an associated file: in particular, problems with a
    // the tsconfig.json don't; the messageText is enough to diagnose in those
    // cases.
    if (diagnostic.file) {
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start || 0)

      messages.push(
        `${diagnostic.file.fileName}(${position.line + 1},${position.character + 1}): ` +
        `error TS${diagnostic.code}: ${messageText}`
      )
    } else {
      messages.push(`error TS${diagnostic.code}: ${messageText}`)
    }
  })

  const error = new Error(messages.join('\n'))

  error.name = 'EmitterError'

  return error
}

const removeExtension = (filePath: string) => filePath.replace(/(\.d)?\.ts$/, '')
