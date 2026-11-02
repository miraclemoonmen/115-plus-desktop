import type { FileSearchRequestParams } from '@/api/types/file';

export const searchTypes = [
  { label: '全部', value: 0 },
  { label: '文档', value: 1 },
  { label: '图片', value: 2 },
  { label: '音乐', value: 3 },
  { label: '视频', value: 4 },
  { label: '压缩包', value: 5 },
  { label: '应用', value: 6 },
];

export function readSearchQuery(query: Record<string, unknown>) {
  const keyword = typeof query.q === 'string' ? query.q.trim() : '';
  const size = Number(query.size);
  const pageSize = [20, 50, 100, 200].includes(size) ? size : 50;
  const page = Number(query.page);
  const type = Number(query.type);
  return {
    keyword,
    pageSize,
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10000 / pageSize) : 1,
    type: (Number.isInteger(type) && type >= 0 && type <= 6 ? type : 0) as NonNullable<
      FileSearchRequestParams['type']
    >,
  };
}

export function searchParams(query: Record<string, unknown>): FileSearchRequestParams {
  const state = readSearchQuery(query);
  return {
    search_value: state.keyword,
    type: state.type,
    limit: state.pageSize,
    offset: (state.page - 1) * state.pageSize,
  };
}
