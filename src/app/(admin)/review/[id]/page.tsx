import { redirect } from 'next/navigation';

export default function LegacyReviewPage({ params }: { params: { id: string } }) {
  redirect(`/admin/review/${encodeURIComponent(params.id)}`);
}
