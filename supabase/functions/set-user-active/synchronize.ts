interface SyncClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  auth: {
    admin: {
      updateUserById(
        id: string,
        values: { ban_duration: string },
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}
interface Claim {
  profile_id: string;
  desired_active: boolean;
  revision: number;
  lease_id: string;
}

export async function synchronizeAccess(client: SyncClient, id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const claimed = await client.rpc('claim_access_sync', { p_id: id });
    if (claimed.error) throw new Error(claimed.error.message);
    const claim = (claimed.data as Claim[] | null)?.[0];
    if (!claim) return false;
    let failure: string | null = null;
    try {
      const result = await client.auth.admin.updateUserById(id, {
        ban_duration: claim.desired_active ? 'none' : '876000h',
      });
      failure = result.error?.message ?? null;
    } catch {
      failure = 'Auth synchronization failed. Retry from Users.';
    }
    const finished = await client.rpc('finish_access_sync', {
      p_id: id,
      p_lease: claim.lease_id,
      p_revision: claim.revision,
      p_error: failure,
    });
    if (finished.error) throw new Error(finished.error.message);
    if (failure) return false;
    if (finished.data === true) return true;
  }
  return false;
}
