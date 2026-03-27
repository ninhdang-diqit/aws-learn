package redis

import (
	"context"
	"log"
	"sync"
	"github.com/redis/go-redis/v9"
)

var (
	rdbInstance *redis.Client
	rdbOnce     sync.Once
	ctx         = context.Background()
)

// InitRedis initializes the singleton redis client instance
func InitRedis(addr string, password string, db int) {
	rdbOnce.Do(func() {
		rdbInstance = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: password,
			DB:       db,
		})

		if _, err := rdbInstance.Ping(ctx).Result(); err != nil {
			log.Fatalf("Failed to connect to redis: %v", err)
		}
	})
}

// GetInstance retrieves the singleton redis client connection
func GetInstance() *redis.Client {
	if rdbInstance == nil {
		log.Println("Redis instance is nil. Did you call InitRedis?")
	}
	return rdbInstance
}
