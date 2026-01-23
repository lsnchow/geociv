"""Logging configuration for CivicSim."""
import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler

# Create logs directory if it doesn't exist
LOGS_DIR = Path(__file__).parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# Log file paths
API_LOG_FILE = LOGS_DIR / "api.log"
BACKBOARD_LOG_FILE = LOGS_DIR / "backboard.log"


def setup_logging():
    """Configure logging for the application."""
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Console handler (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    
    # API log file handler (rotating, 10MB max, keep 5 backups)
    api_file_handler = RotatingFileHandler(
        API_LOG_FILE,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    api_file_handler.setLevel(logging.INFO)
    api_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    api_file_handler.setFormatter(api_formatter)
    
    # Backboard log file handler (rotating, 10MB max, keep 5 backups)
    backboard_file_handler = RotatingFileHandler(
        BACKBOARD_LOG_FILE,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    backboard_file_handler.setLevel(logging.INFO)
    backboard_formatter = logging.Formatter(
        '%(asctime)s - [BACKBOARD] - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    backboard_file_handler.setFormatter(backboard_formatter)
    
    # Add handlers to root logger
    root_logger.addHandler(console_handler)
    root_logger.addHandler(api_file_handler)
    
    # Create specific logger for backboard
    backboard_logger = logging.getLogger('backboard')
    backboard_logger.addHandler(backboard_file_handler)
    backboard_logger.setLevel(logging.INFO)
    
    # Reduce noise from libraries
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
    
    return root_logger


# Convenience function to get logger
def get_logger(name: str) -> logging.Logger:
    """Get a logger instance."""
    return logging.getLogger(name)
