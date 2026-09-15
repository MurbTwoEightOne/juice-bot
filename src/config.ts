import dotenv from 'dotenv'

dotenv.config()

function getRequiredEnv (name: string): string {
  const value = process.env[name]
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  discordToken: getRequiredEnv('DISCORD_TOKEN'),
  clientId: getRequiredEnv('CLIENT_ID'),
  databaseUrl: getRequiredEnv('DATABASE_URL')
}
