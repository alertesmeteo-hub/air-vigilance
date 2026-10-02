# air-vigilance

App Next.js autonome affichant la carte de qualité de l'air (indice ATMO par département,
aujourd'hui/demain), déployée sur `air-vigilance.alertes-meteo.com`.

Les données sont lues directement depuis
https://raw.githubusercontent.com/alertesmeteo-hub/qualite-air-atmo-france (pas d'API propre à
cette app).

## Déploiement (VPS, pm2 + nginx)

```bash
cd /var/www
git clone https://github.com/alertesmeteo-hub/air-vigilance.git
cd air-vigilance
npm install
npm run build
pm2 start npm --name air-vigilance -- start -- -p <PORT_LIBRE>
pm2 save
```

Puis mettre à jour `proxy_pass` vers ce port dans
`/etc/nginx/sites-available/air-vigilance` et `sudo systemctl reload nginx`.
