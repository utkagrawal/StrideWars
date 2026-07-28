package repository

import (
	"stridewars/backend/internal/database"
	"stridewars/backend/internal/models"
)

func CreateUser(user *models.User) error {
	return database.DB.Create(user).Error
}

func GetUserByEmail(email string) (*models.User, error) {

	var user models.User

	err := database.DB.Where("email = ?", email).First(&user).Error

	return &user, err
}

func GetUserByID(id string) (*models.User, error) {

	var user models.User

	err := database.DB.First(&user, "id = ?", id).Error

	return &user, err
}