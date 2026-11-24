import { redirect } from "next/navigation";
import { ChangePassword } from "@/components/ChangePassword";
import { currentStaff } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/login");
  return (
    <div className="page">
      <ChangePassword forced={staff.mustChangePassword} />
    </div>
  );
}
