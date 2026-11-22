import { StaffLogin } from "@/components/StaffLogin";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <div className="page">
      <StaffLogin next={(await searchParams).next} />
    </div>
  );
}
