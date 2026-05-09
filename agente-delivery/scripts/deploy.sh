#!/bin/bash
cat > /tmp/ssh-askpass.sh << 'ASKEOF'
#!/bin/bash
echo 'fd,JrI)f,3Tbbmb@'
ASKEOF
chmod +x /tmp/ssh-askpass.sh
DISPLAY=dummy SSH_ASKPASS=/tmp/ssh-askpass.sh ssh -o StrictHostKeyChecking=no root@2.24.72.12 "
cd MegaBot/agente-delivery
git pull
npm run build
# Asegurar bypass activo para IguazuFalls
mkdir -p data/iguazufalls
echo 1 > data/iguazufalls/bypass_receipt.flag
pm2 kill
pm2 start ecosystem.config.js
echo DEPLOY_OK
"
rm -f /tmp/ssh-askpass.sh