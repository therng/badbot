#!/bin/bash
cd /Users/supachai/github/badbot
docker compose down
docker compose up -d --build
