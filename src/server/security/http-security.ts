type SecurityHeader = {
  key: string;
  value: string;
};

export const DEFAULT_SECURITY_HEADERS: SecurityHeader[] = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

export const API_NO_STORE_HEADERS: SecurityHeader[] = [
  {
    key: "Cache-Control",
    value: "no-store",
  },
];

export function getNextSecurityHeaderRules() {
  return [
    {
      source: "/:path*",
      headers: DEFAULT_SECURITY_HEADERS,
    },
    {
      source: "/api/:path*",
      headers: API_NO_STORE_HEADERS,
    },
  ];
}

export function applySecurityHeaders(headers: Headers) {
  DEFAULT_SECURITY_HEADERS.forEach((header) => {
    headers.set(header.key, header.value);
  });

  return headers;
}
