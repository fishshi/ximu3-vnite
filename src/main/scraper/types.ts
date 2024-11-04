export type GameList = {
  id: string
  name: string
  releaseDate: string
  developers: string[]
}[]

export type GameMetadata = {
  name: string
  originalName: string | null
  releaseDate: string
  description: string
  developers: string[]
  publishers?: string[]
  genres?: string[]
  relatedSites: {
    label: string
    url: string
  }[]
  tags: string[]
}
