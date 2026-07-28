package services

import (
	"stridewars/backend/internal/config"
	"stridewars/backend/internal/models"
	"stridewars/backend/internal/repository"
	"stridewars/backend/internal/utils"

	"github.com/google/uuid"
)

func Register(req models.RegisterRequest) error {

	hash, err := utils.HashPassword(req.Password)

	if err != nil {
		return err
	}

	user := models.User{
		ID:       uuid.New(),
		Name:     req.Name,
		Email:    req.Email,
		Password: hash,
	}

	return repository.CreateUser(&user)
}

func Login(req models.LoginRequest, cfg *config.Config) (string, error) {

	user, err := repository.GetUserByEmail(req.Email)

	if err != nil {
		return "", err
	}

	if !utils.CheckPassword(req.Password, user.Password) {
		return "", err
	}

	return utils.GenerateJWT(user.ID.String(), cfg.JWTSecret)
}