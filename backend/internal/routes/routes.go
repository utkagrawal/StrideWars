package routes

import (
	"stridewars/backend/internal/config"
	"stridewars/backend/internal/handlers"
	"stridewars/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func Register(router *gin.Engine, cfg *config.Config) {

	router.GET("/health", handlers.Health)

	router.POST("/register", handlers.Register(cfg))
	router.POST("/login", handlers.Login(cfg))

	auth := router.Group("/")

	auth.Use(middleware.Auth(cfg.JWTSecret))

	auth.GET("/me", handlers.Me)
}