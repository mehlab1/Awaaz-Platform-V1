import Link from "next/link";
import { OrgSwitcher } from "@/components/org-switcher";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col gap-4 border-r border-border bg-muted/30 p-4">
        <Link href="/agents" className="text-lg font-semibold">
          Awaaz
        </Link>
        <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
          <Link href="/agents" className="text-foreground hover:underline">
            Agents
          </Link>
        </nav>
        <div className="mt-auto">
          <OrgSwitcher />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
