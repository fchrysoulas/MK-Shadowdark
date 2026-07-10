function getPrimaryActiveGm() {
  return Array.from(game.users ?? [])
    .filter(user => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function isPrimaryActiveGm() {
  return game.user?.isGM && getPrimaryActiveGm()?.id === game.user.id;
}

function getGameUserById(userId) {
  if (!userId) return null;
  return game.users?.get?.(userId)
    ?? Array.from(game.users ?? []).find(user => user.id === userId)
    ?? null;
}

export {
  getPrimaryActiveGm,
  isPrimaryActiveGm,
  getGameUserById,
};
