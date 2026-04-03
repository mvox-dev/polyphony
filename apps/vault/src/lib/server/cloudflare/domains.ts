// Cloudflare Pages custom domain registration
// Automatically registers {subdomain}.polyphony.uk when a new organization is created

const DOMAIN_SUFFIX = "polyphony.uk";

export interface DomainRegistrationResult {
  success: boolean;
  domain?: string;
  status?: string;
  error?: string;
}

function validateEnvironment(env: {
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  CF_PAGES_PROJECT?: string;
}): string | null {
  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT } = env;
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_PAGES_PROJECT) {
    console.warn(
      "[CF Domains] Cloudflare domain registration not configured (missing CF_ACCOUNT_ID, CF_API_TOKEN, or CF_PAGES_PROJECT)",
    );
    return "Domain registration not configured";
  }
  return null;
}

async function callCloudflareAPI(
  url: string,
  apiToken: string,
  domain: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domain }),
  });

  return (await response.json()) as {
    success: boolean;
    result?: { name: string; status: string };
    errors?: Array<{ message: string; code: number }>;
  };
}

function handleSuccessResponse(
  data: {
    result?: { name: string; status: string };
  },
  domain: string,
): DomainRegistrationResult {
  console.log(
    `[CF Domains] Registered ${domain} (status: ${data.result?.status})`,
  );
  return {
    success: true,
    domain,
    status: data.result?.status || "initializing",
  };
}

function handleErrorResponse(
  data: {
    errors?: Array<{ message: string; code: number }>;
  },
  domain: string,
): DomainRegistrationResult {
  const errorMsg = data.errors?.[0]?.message || "Unknown Cloudflare API error";
  // Domain already exists is not a real error (code 8000040)
  if (data.errors?.[0]?.code === 8000040) {
    return { success: true, domain, status: "already_active" };
  }
  console.error(`[CF Domains] Failed to register ${domain}: ${errorMsg}`);
  return { success: false, domain, error: errorMsg };
}

function handleAPIResponse(
  data: {
    success: boolean;
    result?: { name: string; status: string };
    errors?: Array<{ message: string; code: number }>;
  },
  domain: string,
): DomainRegistrationResult {
  return data.success
    ? handleSuccessResponse(data, domain)
    : handleErrorResponse(data, domain);
}

/**
 * Register a custom domain on the Cloudflare Pages project.
 * Called after organization creation to enable subdomain routing.
 *
 * Requires env vars: CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT
 */
export async function registerSubdomain(
  subdomain: string,
  env: {
    CF_ACCOUNT_ID?: string;
    CF_API_TOKEN?: string;
    CF_PAGES_PROJECT?: string;
  },
): Promise<DomainRegistrationResult> {
  const envError = validateEnvironment(env);
  if (envError) {
    return { success: false, error: envError };
  }

  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT } = env;
  const domain = `${subdomain}.${DOMAIN_SUFFIX}`;
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT}/domains`;

  try {
    const data = await callCloudflareAPI(url, CF_API_TOKEN!, domain);
    return handleAPIResponse(data, domain);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[CF Domains] Network error registering ${domain}: ${message}`,
    );
    return { success: false, domain, error: message };
  }
}
