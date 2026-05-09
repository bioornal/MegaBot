#!/bin/bash
cat > /tmp/ssh-askpass.sh << 'ASKEOF'
#!/bin/bash
echo 'fd,JrI)f,3Tbbmb@'
ASKEOF
chmod +x /tmp/ssh-askpass.sh
DISPLAY=dummy SSH_ASKPASS=/tmp/ssh-askpass.sh ssh -o StrictHostKeyChecking=no root@2.24.72.12 "
cd MegaBot/agente-delivery
git fetch origin
git reset --hard origin/main
npm run build
pm2 kill
pm2 start ecosystem.config.js
echo DEPLOY_OK
"
rm -f /tmp/ssh-askpass.sh