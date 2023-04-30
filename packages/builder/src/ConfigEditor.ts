import type {
  IBuildEnvironment,
  IBuilderOptions,
  IConfigCustomizer,
  IConfigEditor,
  IEntryFilter,
  IFilter,
  IPathResolver,
  ITargetedExpandedEntries,
  IWebpackConfigs
} from './interfaces'
import initConfigs from './filters/initConfigs'
import unbundleExternals from './filters/unbundleExternals'
import replaceVars from './filters/replaceVars'
import replaceImports from './filters/replaceImports'
import generateDts from './filters/generateDts'
import devServer from './filters/devServer'
import { resolver } from './lib/paths'
import { expandTargetedEntries } from './lib/helpers'

const defaultFilters = {
  unbundleExternals,
  replaceVars,
  replaceImports,
  generateDts,
  devServer // should always placed last
}

export default class ConfigEditor implements IConfigCustomizer, IConfigEditor {
  readonly path: IPathResolver
  private _configs: IWebpackConfigs = {}
  private _entries: ITargetedExpandedEntries = {}
  private _options: IBuilderOptions

  private readonly entryFilters: IEntryFilter[] = []

  constructor (
    envName: IBuildEnvironment,
    rootPath: string,
    private readonly filters: Record<string, IFilter | null> = defaultFilters
  ) {
    this.path = resolver(rootPath)
    this._options = {
      envName,
      entryPatterns: ['packages/**/index.ts'],
      rootPath,
      replacements: [
        {
          map: { react: 'preact/compat', 'react-dom': 'preact/compat' },
          pattern: /preact/
        }
      ]
    }
  }

  public get configs () {
    return this._configs
  }

  public get entries () {
    return this._entries
  }

  public get options () {
    return this._options
  }

  filter (filterName: string, filter: IFilter | null) {
    this.filters[filterName] = filter
  }

  updateEntries (entryFilter: IEntryFilter) {
    this.entryFilters.push(entryFilter)
  }

  updateOptions (customOptions: Partial<IBuilderOptions>) {
    this._options = {
      ...this._options,
      ...customOptions
    }
  }

  async init () {
    let entries = await expandTargetedEntries(this.path, this.options.entryPatterns)

    for await (const entryFilter of this.entryFilters) {
      entries = await entryFilter(entries)
    }

    this._entries = entries

    const filters = [initConfigs, ...Object.values(this.filters)]

    for await (const filter of filters) {
      await this.applyFilter(filter)
    }
  }

  private async applyFilter (filter: IFilter | null) {
    if (!filter) {
      return
    }

    const output = await filter({ editor: this })

    this._configs = output.configs
  }
}
