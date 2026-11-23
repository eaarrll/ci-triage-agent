import Link from "next/link";

const NAV = [
  { href: "/reports/revenue", label: "Revenue" },
  { href: "/reports/accounts", label: "Accounts" },
];

export default function ReportsLayout({ children }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-8">
      <nav className="flex flex-col gap-2">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="text-sm hover:underline">
            {item.label}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}
