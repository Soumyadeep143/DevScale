import { useCallback, useEffect, useState } from 'react';
import { fetchPeers, fetchMyLeads, fetchSharedLeads, fetchContacts, fetchSharedContacts } from './api';
import { useSharedChanges } from './sharedUpdates';

const EMPTY = { peers: [], myLeads: [], sharedLeads: [], myContacts: [], sharedContacts: [] };

// One load of everything the Team Overview and Activity pages need. Each call is an existing
// database function / RLS-protected query, so this never reaches data the user can't read.
export function useTeamData() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const [peers, myLeads, sharedLeads, myContacts, sharedContacts] = await Promise.all([
        fetchPeers(), fetchMyLeads(), fetchSharedLeads(), fetchContacts(), fetchSharedContacts(),
      ]);
      setData({ peers, myLeads, sharedLeads, myContacts, sharedContacts });
    } catch (e) {
      setError(e.message || 'Could not load your team data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useSharedChanges(['leads', 'contacts', 'peers'], reload); // reload live when peers change what they share with you

  return { ...data, loading, error, reload };
}
