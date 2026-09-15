import { Suspense } from 'react';
import { CaseDetail } from '../../../screens/CaseDetail';

export const metadata = { title: 'Case' };

/**
 * The case id travels in the query string rather than a dynamic segment:
 * a static export cannot enumerate Convex document ids at build time.
 * useSearchParams requires a Suspense boundary during prerender.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CaseDetail />
    </Suspense>
  );
}
