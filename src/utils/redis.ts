import Redis from 'ioredis'
import logger from '~/utils/logger'

export const redis = new Redis(`${process.env.REDIS_URL!}?family=0`, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
})

redis.on('connect', () => {
  logger.info('Redis connected')
})

redis.on('error', error => {
  logger.error('Redis connection error:', error)
})
