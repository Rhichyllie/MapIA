"use client";

import { Link, usePathname } from "@/src/i18n/navigation";

type NavLinkProps = {
  href: string;
  label: string;
};

export function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link className="nav-link" data-active={isActive} href={href}>
      {label}
    </Link>
  );
}
