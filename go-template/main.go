package main

import (
	"log"

	"go-template/api"
	"go-template/config"
	"go-template/database"
	"go-template/elastic"
	"go-template/grpc/server"
	"go-template/messaging"
	"go-template/redis"
)

func main() {
	// Load configuration struct
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize Postgres (Gorm)
	log.Println("Initializing Postgres singleton...")
	database.InitDB(cfg.DB_DSN)

	// Initialize Redis
	log.Println("Initializing Redis singleton...")
	redis.InitRedis(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)

	// Initialize Elastic Search
	log.Println("Initializing Elastic Search singleton...")
	elastic.InitElasticSearch(cfg.ElasticSearchURL)

	// Initialize RabbitMQ
	log.Println("Initializing RabbitMQ singleton...")
	messaging.InitRabbitMQ(cfg.RabbitMQURL)
	defer messaging.CloseRabbitMQ()

	// Start gRPC Server in a goroutine
	go func() {
		server.StartGRPCServer(cfg.GRPCPort)
	}()

	// Start Gin HTTP Server
	log.Printf("Starting Gin server on %s...", cfg.GinPort)
	r := api.SetupRouter()
	if err := r.Run(cfg.GinPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
