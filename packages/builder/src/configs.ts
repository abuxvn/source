/*! Copyright (c) 2023 ABux. Under MIT license found in the LICENSE file */
import type { IBuildEnvironment, IBuilderCustomOptions, IConfigDeps, IConfigEditor, IWebpackConfig } from './interfaces'

import ConfigEditor from './ConfigEditor'
import { pathExists } from './lib/vendors'
import { styles } from '@abux/logger/cli'
import ConfigDeps from './ConfigDeps'
import { moduleFromFile } from './lib/packages'

interface IConfigCustom {
  options: IBuilderCustomOptions
}

export const getConfigs = async (
  rootPath: string,
  envName: IBuildEnvironment = 'development',
  custom?: IConfigCustom
): Promise<{
  deps: IConfigDeps
  editor: IConfigEditor
  configs: IWebpackConfig[]
}> => {
  const deps = new ConfigDeps()
  const editor = new ConfigEditor({ envName, rootPath, deps })
  const customizerFile = editor.path.resolve('abux.config.js')

  addDefaultDeps(deps)

  if (custom?.options) {
    editor.updateOptions(custom.options)
  }

  if (await pathExists(customizerFile)) {
    // since nodejs built-in `require` doesn't work with local js file:
    // - access from folder outside yarn pnp managed workspaces
    // - access from installed packages with yarn pnp (in zip folders in .yarn/cache)
    // we need to load code from text file instead
    const customConfig = await moduleFromFile(customizerFile)

    if (customConfig.options) {
      editor.updateOptions(customConfig.options)
    }

    if (customConfig.filter && typeof customConfig.filter === 'function') {
      editor.filter('workspace:custom', customConfig.filter)
    }
  }

  await editor.init()

  const configs = editor.configs

  return {
    deps,
    editor,
    configs: configs.map(config => ({
      ...config,
      name: styles.bold.underline.greenBright(config.name),
      plugins: config.plugins.filter(Boolean)
    }))
  }
}

const addDefaultDeps = (deps: IConfigDeps) => {
  deps.set('typescript', { version: '^5.0.4' })
  deps.set('webpack', { version: '^5.80.0' })
  deps.set('eslint', {
    version: '^8.39.0',
    dev: true,
    dependencies: [
      { name: '@typescript-eslint/eslint-plugin', version: '^5.59.1' },
      { name: '@typescript-eslint/parser', version: '^5.59.1' },
      { name: 'eslint', version: '^8.39.0' },
      { name: 'eslint-config-standard', version: '^17.0.0' },
      { name: 'eslint-config-standard-with-typescript', version: '^34.0.1' },
      { name: 'eslint-plugin-import', version: '^2.27.5' },
      { name: 'eslint-plugin-jest', version: '^27.2.1' },
      { name: 'eslint-plugin-n', version: '^15.7.0' },
      { name: 'eslint-plugin-promise', version: '^6.1.1' }
    ]
  })
  deps.set('jest', {
    version: '^29.5.0',
    dev: true,
    dependencies: [
      { name: 'ts-jest', version: '^29.1.0' },
      { name: '@types/jest', version: '^29.5.1' }
    ]
  })
}
