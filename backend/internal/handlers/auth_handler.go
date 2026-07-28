package handlers

import (
	"net/http"

	"stridewars/backend/internal/config"
	"stridewars/backend/internal/models"
	"stridewars/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func Register(cfg *config.Config) gin.HandlerFunc {

	return func(c *gin.Context) {

		var req models.RegisterRequest

		if c.ShouldBindJSON(&req) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		if err := services.Register(req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"message": "registered"})
	}
}

func Login(cfg *config.Config) gin.HandlerFunc {

	return func(c *gin.Context) {

		var req models.LoginRequest

		if c.ShouldBindJSON(&req) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		token, err := services.Login(req, cfg)

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token": token,
		})
	}
}