package service

import (
	"context"
	"errors"
	"time"
	"go-template/database"
	"go-template/elastic"
	"go-template/messaging"
	"go-template/models"
	"go-template/redis"
	"go-template/utils"
	"golang.org/x/crypto/bcrypt"
)

type UserService interface {
	CreateUser(ctx context.Context, user *models.User) error
	GetUser(ctx context.Context, id uint) (*models.User, error)
	Login(ctx context.Context, email, password string, secret string, expirationHours int) (string, error)
	Logout(ctx context.Context, userID uint, jti string) error
	EvictUser(ctx context.Context, userID uint) error
}

type userService struct{}

func NewUserService() UserService {
	return &userService{}
}

func (s *userService) CreateUser(ctx context.Context, user *models.User) error {
	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	user.Password = string(hashedPassword)

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

func (s *userService) Login(ctx context.Context, email, password string, secret string, expirationHours int) (string, error) {
	user, err := database.GetUserByEmail(email)
	if err != nil {
		return "", errors.New("user not found")
	}

	// Compare password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return "", errors.New("invalid credentials")
	}

	// Generate stateful JWT (with JTI)
	tokenStr, jti, err := utils.GenerateToken(user.ID, secret, expirationHours)
	if err != nil {
		return "", err
	}

	// Store JTI in Redis session 
	err = redis.SetSession(user.ID, jti, time.Duration(expirationHours)*time.Hour)
	if err != nil {
		return "", err
	}

	return tokenStr, nil
}

func (s *userService) Logout(ctx context.Context, userID uint, jti string) error {
	return redis.RevokeSession(userID, jti)
}

func (s *userService) EvictUser(ctx context.Context, userID uint) error {
	return redis.EvictUser(userID)
}
