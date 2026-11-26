declare module 'yt-search' {
  export interface YtSearchVideo {
    videoId: string;
    title: string;
    author?: { name?: string };
    seconds?: number;
    thumbnail?: string;
  }

  export interface YtSearchResult {
    videos: YtSearchVideo[];
  }

  export default function ytSearch(query: string): Promise<YtSearchResult>;
}
