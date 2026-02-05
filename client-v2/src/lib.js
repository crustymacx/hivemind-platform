export const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return '--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs) return `${hrs}h ${mins}m`;
  if (mins) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

export const formatTime = (timestamp) => {
  const date = new Date(timestamp || Date.now());
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const scoreLabel = (score) => {
  if (score > 200) return 'Legend';
  if (score > 120) return 'Vanguard';
  if (score > 60) return 'Initiate';
  return 'Scout';
};
