export function getApiPort(env: Pick<NodeJS.ProcessEnv, 'PORT'> = process.env): number {
  return Number(env.PORT ?? 7311);
}
