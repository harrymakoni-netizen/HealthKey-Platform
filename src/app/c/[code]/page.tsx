import PublicFlow from "@/components/public-flow";
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return <PublicFlow code={(await params).code} />;
}
