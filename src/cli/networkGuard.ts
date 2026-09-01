/**
 * Refuse to start a silent private fork when the operator skipped seeds
 * and did not pass any peers.
 */
export function assertWillJoinNetwork(useDefaultSeeds: boolean, peers: string[]): void {
  if (!useDefaultSeeds && peers.length === 0) {
    throw new Error(
      'Brak seedów i brak ręcznie podanych peerów — ten węzeł nie połączy się z istniejącą siecią.',
    );
  }
}
