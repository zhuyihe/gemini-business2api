#!/bin/bash

# Gemini Business2API 服务器快速配置脚本
# 用于首次在服务器上配置部署环境 

set -e

echo "=========================================="
echo "Gemini Business2API 服务器配置脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -eq 0 ]; then 
    echo -e "${YELLOW}警告: 建议使用普通用户运行此脚本${NC}"
fi

# 1. 检查并安装 Docker
echo -e "${GREEN}[1/5] 检查 Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo "Docker 未安装，正在安装..."
    curl -fsSL https://get.docker.com | bash
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✓ Docker 安装完成${NC}"
else
    echo -e "${GREEN}✓ Docker 已安装${NC}"
fi

# 2. 检查并安装 Docker Compose
echo ""
echo -e "${GREEN}[2/5] 检查 Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose 未安装，正在安装..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✓ Docker Compose 安装完成${NC}"
else
    echo -e "${GREEN}✓ Docker Compose 已安装${NC}"
fi

# 3. 检查并安装 Git
echo ""
echo -e "${GREEN}[3/5] 检查 Git...${NC}"
if ! command -v git &> /dev/null; then
    echo "Git 未安装，正在安装..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y git
    elif command -v yum &> /dev/null; then
        sudo yum install -y git
    fi
    echo -e "${GREEN}✓ Git 安装完成${NC}"
else
    echo -e "${GREEN}✓ Git 已安装${NC}"
fi

# 4. 创建项目目录
echo ""
echo -e "${GREEN}[4/5] 配置项目目录...${NC}"
PROJECT_DIR="/opt/gemini-business2api"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "创建项目目录: $PROJECT_DIR"
    sudo mkdir -p "$PROJECT_DIR"
    sudo chown -R $USER:$USER "$PROJECT_DIR"
    echo -e "${GREEN}✓ 项目目录创建完成${NC}"
else
    echo -e "${GREEN}✓ 项目目录已存在${NC}"
fi

# 5. 配置防火墙
echo ""
echo -e "${GREEN}[5/5] 配置防火墙...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw allow 7860/tcp
    echo -e "${GREEN}✓ UFW 防火墙已配置（端口 7860）${NC}"
elif command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --permanent --add-port=7860/tcp
    sudo firewall-cmd --reload
    echo -e "${GREEN}✓ Firewalld 防火墙已配置（端口 7860）${NC}"
else
    echo -e "${YELLOW}⚠ 未检测到防火墙，请手动开放端口 7860${NC}"
fi

# 完成
echo ""
echo "=========================================="
echo -e "${GREEN}✓ 服务器配置完成！${NC}"
echo "=========================================="
echo ""
echo "下一步操作："
echo ""
echo "1. 配置 GitHub Actions Secrets（在 GitHub 仓库设置中）："
echo "   - SERVER_HOST: $(curl -s ifconfig.me)"
echo "   - SERVER_USER: $USER"
echo "   - SERVER_SSH_KEY: 你的 SSH 私钥"
echo "   - DEPLOY_PATH: $PROJECT_DIR"
echo ""
echo "2. 在服务器上配置 SSH 公钥："
echo "   echo '你的公钥' >> ~/.ssh/authorized_keys"
echo ""
echo "3. 克隆仓库并配置 .env："
echo "   cd $PROJECT_DIR"
echo "   git clone https://github.com/你的用户名/gemini-business2api.git ."
echo "   cp .env.example .env"
echo "   nano .env  # 设置 ADMIN_KEY"
echo ""
echo "4. 推送代码到 GitHub 触发自动部署"
echo ""
echo -e "${YELLOW}注意: 如果你在 docker 组中，需要重新登录才能生效${NC}"
echo ""
