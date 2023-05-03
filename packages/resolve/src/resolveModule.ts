import { resolve } from './resolve'
import { readJSON, getDirPath } from './lib'
import type { IModule, IResolveOptions } from './interfaces'

export const resolveModule = async (moduleOrDirPath: string, options?: IResolveOptions): Promise<IModule> => {
  const module: IModule = {
    exists: false,
    query: moduleOrDirPath,
    path: '',
    main: 'index.js',
    name: '',
    version: '',
    dependencies: []
  }

  try {
    const path = moduleOrDirPath.replace(/\\/g, '/') // normalize separators to front slashes
      .replace(/\/$/, '') // remove last slash

    const packageJsonFilePath = await resolve(`${path}/package.json`, options)

    if (packageJsonFilePath) {
      const packageJson: any = await readJSON(packageJsonFilePath)

      return {
        ...module,
        path: getDirPath(packageJsonFilePath),
        name: packageJson.name || '',
        main: packageJson.main || 'index.js',
        exists: true
      }
    } else {
      return module
    }
  } catch (err) {
    return {
      ...module,
      error: err as Error
    }
  }
}