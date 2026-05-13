type ApiPortEnv = {
  PORT?: string;
};

export function getApiPort(env: ApiPortEnv = process.env): number {
  return Number(env.PORT ?? 7311);
}
