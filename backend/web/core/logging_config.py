import os
import logging
import logging.config

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        },
    },
    "handlers": {
        "console": {
            "level": os.getenv("LOG_LEVEL", "INFO"),
            "formatter": "standard",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout"
        },
    },
    "loggers": {
        "": {
            "level": os.getenv("LOG_LEVEL", "INFO"),
            "handlers": ["console"],
            "propagate": False
        },
        "uvicorn.error": {
            "level": "DEBUG",
            "handlers": ["console"],
            "propagate": False
        },
        "uvicorn.access": {
            "level": "DEBUG",
            "handlers": ["console"],
            "propagate": False
        },
    }
}

def setup_logging():
    logging.config.dictConfig(LOGGING_CONFIG)