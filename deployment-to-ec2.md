# SoulScript - AWS EC2 Deployment Guide

This guide provides step-by-step instructions for deploying the SoulScript application to AWS EC2 using Docker Compose.

## Architecture

The application consists of:
- **Frontend**: React + Vite (Nginx)
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL
- **Reverse Proxy**: Traefik (optional)
- **Email Testing**: Mailcatcher

## Step 1: Launch EC2 Instance

### 1.1 Create EC2 Instance
1. Go to AWS Console → EC2 → Launch Instance
2. **Name**: `soulscript-production`
3. **AMI**: Ubuntu Server 24.04 LTS (HVM)
4. **Instance Type**: `t3.small` (recommended to run docker)
5. **Key Pair**: Create new or select existing
6. **Network Settings**: Create new security group or select existing
7. Check **Allow HTTPS traffic from the internet**
8. Check **Allow HTTP traffic from the internet**

### 1.2 Configure Storage
Configure the storage settings for your instance:

1. **Storage Type**: General Purpose SSD (gp3)
2. **Size**: 20 GiB (recommended for Docker containers and application data)
3. **IOPS**: Leave as default (3000)
4. **Throughput**: Leave as default 

### 1.3 Launch and Note Details
- Launch the instance
- Note the **Public IP address**
- Note the **Instance ID**

### 1.4 Configure Security Group Inbound Rules (After Instance Creation)
After your instance is running, you need to configure the security group inbound rules:

1. **Go to EC2 Dashboard** → **Security Groups** (left sidebar)
2. **Select your security group** (the one attached to your instance)
3. **Click "Edit inbound rules"**
4. **Add the following rules**:

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| Custom TCP | TCP | 8000 | 0.0.0.0/0 |  |
| Custom TCP | TCP | 8080 | 0.0.0.0/0 |  |

5. **Click "Save rules"**

## Step 2: Connect and Setup EC2

### 2.1 SSH into Instance
```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```
Or connect from the web portal

### 2.2 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 2.3 Install Docker
```bash
# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package index
sudo apt update

# Install Docker
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -a -G docker ubuntu
```

### 2.4 Install Docker Compose
```bash
# Download Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Make executable
sudo chmod +x /usr/local/bin/docker-compose
```

### 2.5 Logout and Reconnect
```bash
exit
# SSH back in for docker group to take effect
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

## Step 3: Deploy Application

### 3.1 Clone Repository
```bash
# Clone your repository
git clone https://github.com/oyinlola007/SoulScript.git
cd SoulScript

```

### 3.2 Create Environment Configuration
```bash
# Copy the example environment file
cp example.env .env

# Edit the environment file
nano .env
```

**Nano Editor Commands:**
- **Save**: Press `Ctrl + X`, then `Y`, then `Enter`
- **Exit without saving**: Press `Ctrl + X`, then `N`
- **Search**: Press `Ctrl + W` to search for text
- **Navigate**: Use arrow keys to move around

**Required Changes to Make in .env:**

Replace the following values with your EC2 instance details:

| Variable | Change From | Change To |
|----------|-------------|-----------|
| `DOMAIN` | `localhost` | `your-ec2-public-ip` |
| `FRONTEND_HOST` | `http://localhost:80` | `http://your-ec2-public-ip:80` |
| `ENVIRONMENT` | `local` | `production` |
| `BACKEND_CORS_ORIGINS` | `"http://localhost:80"` | `"http://your-ec2-public-ip:80"` |

**Security Changes (Recommended):**
| Variable | Change From | Change To |
|----------|-------------|-----------|
| `SECRET_KEY` | `changethis` | Generate a new secure key |
| `POSTGRES_PASSWORD` | `changethis` | Generate a new secure password |
| `OPENAI_API_KEY` | `changethis` | Add your OpenAI API key |

**To generate secure keys:**
```bash
# Generate a secure secret key
openssl rand -base64 32
```

**Optional Changes:**
- `FIRST_SUPERUSER`: Change from `admin@denistek.com` to your preferred admin email
- `FIRST_SUPERUSER_PASSWORD`: Change from `adminPassword` to your preferred admin password
- `EMAILS_FROM_EMAIL`: Change from `admin@denistek.com` to your preferred email


**Important**: Replace `your-ec2-public-ip` with your actual EC2 public IP address in all the above variables.

### 3.3 Build and Start Services
```bash
# Build and start all services
docker-compose build --build-arg VITE_API_URL=http://your-ec2-public-ip:8000 && docker-compose up -d

# Check service status
docker-compose ps
```
## Step 4: Access Application

### 4.1 Frontend Access
- **URL**: `http://your-ec2-public-ip:80`
- **Default Admin**: `admin@denistek.com` / `adminPassword`

### 4.2 Backend API
- **Health Check**: `http://your-ec2-public-ip:8000/api/v1/utils/health-check/`
- **API Docs**: `http://your-ec2-public-ip:8000/docs`

### 4.3 Database Access (Optional)
- **Adminer**: `http://your-ec2-public-ip:8080`
- **Host**: `db`
- **User**: `postgres`
- **Password**: `your-secure-password-here`

