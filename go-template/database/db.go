package database

import (
	"log"
	"sync"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var (
	dbInstance *gorm.DB
	dbOnce     sync.Once
)

// InitDB initializes the singleton database instance
func InitDB(dsn string) {
	dbOnce.Do(func() {
		var err error
		dbInstance, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
	})
}

// GetInstance retrieves the singleton database connection
func GetInstance() *gorm.DB {
	if dbInstance == nil {
		log.Println("Database instance is nil. Did you call InitDB?")
	}
	return dbInstance
}
