import { EMPTY, Observable, expand, map, toArray } from 'rxjs';
import { PageResponse } from '../models/page-response.model';

// Tải lần lượt các trang để ô chọn có đủ dữ liệu và lọc ngay trên trình duyệt.
export function loadAllPages<T>(load: (page: number) => Observable<PageResponse<T>>): Observable<T[]> {
  return load(0).pipe(
    expand(page => page.page + 1 < page.totalPages ? load(page.page + 1) : EMPTY, 1),
    toArray(),
    map(pages => pages.flatMap(page => page.content))
  );
}
