import { redirect } from "next/navigation";

type WizardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function WizardPage({ searchParams }: WizardPageProps) {
  const params = await searchParams;
  const projectId = getStringParam(params, "projectId");
  const query = new URLSearchParams();

  if (projectId) {
    query.set("fromProjectId", projectId);
  }

  const queryString = query.toString();
  redirect(queryString.length > 0 ? `/create?${queryString}` : "/create");
}
