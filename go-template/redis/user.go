package redis

import (
	"encoding/json"
	"fmt"
	"time"
	"github.com/redis/go-redis/v9"
	"go-template/models"
)

func CacheUser(user *models.User) error {
	data, err := json.Marshal(user)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("user:%d", user.ID)
	return GetInstance().Set(ctx, key, data, 24*time.Hour).Err()
}

func GetCachedUser(id uint) (*models.User, error) {
	key := fmt.Sprintf("user:%d", id)
	val, err := GetInstance().Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	} else if err != nil {
		return nil, err
	}

	var user models.User
	err = json.Unmarshal([]byte(val), &user)
	return &user, err
}
