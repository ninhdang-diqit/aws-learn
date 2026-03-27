package service

import (
	"context"
	"go-template/database"
	"go-template/elastic"
	"go-template/messaging"
	"go-template/models"
	"go-template/redis"
)

type UserService interface {
	CreateUser(ctx context.Context, user *models.User) error
	GetUser(ctx context.Context, id uint) (*models.User, error)
}

type userService struct{}

func NewUserService() UserService {
	return &userService{}
}

func (s *userService) CreateUser(ctx context.Context, user *models.User) error {
	if err := database.CreateUser(user); err != nil {
		return err
	}
	_ = elastic.IndexUser(user)
	_ = redis.CacheUser(user)
	_ = messaging.PublishUserCreatedEvent(user)
	return nil
}

func (s *userService) GetUser(ctx context.Context, id uint) (*models.User, error) {
	if user, err := redis.GetCachedUser(id); err == nil && user != nil {
		return user, nil
	}
	user, err := database.GetUser(id)
	if err != nil {
		return nil, err
	}
	_ = redis.CacheUser(user)
	return user, nil
}
