# Tester la confirmation avec Resend

Dans `.env`, conserver la clé uniquement en local et compléter :

```dotenv
MAIL_DRIVER=resend
MAIL_FROM="Kadea Chat <onboarding@resend.dev>"
MAIL_TEST_MODE=true
MAIL_TEST_RECIPIENT=developer@example.com
APP_URL=http://localhost:3333
```

Remplacer `developer@example.com` par **l’adresse exacte associée au compte Resend**. Ce destinataire n’est pas l’expéditeur. Ne pas copier la clé dans les fichiers d’exemple. Redémarrer le serveur après modification (`npm.cmd run dev`). Aucune installation ni migration supplémentaire n’est nécessaire.

Le compte en attente est mémorisé en session après inscription ou connexion avec les bons identifiants d’un compte non confirmé. La page affiche son nom et son adresse d’inscription ; le bouton « Renvoyer le lien de confirmation » reprend ce compte sans demander le destinataire. Une adresse envoyée manuellement avec ce formulaire ne remplace pas le contexte existant. « Confirmer un autre compte » efface ce contexte. Sans contexte, saisir l’adresse d’inscription du compte à confirmer, jamais celle de la boîte de réception de test. Les messages de test indiquent le nom, le numéro et l’adresse du compte.

Sur Render, le `.env` local n’est pas transféré automatiquement. Renseigner `RESEND_API_KEY`, `MAIL_DRIVER`, `MAIL_FROM`, `MAIL_TEST_MODE`, `MAIL_TEST_RECIPIENT` et `APP_URL` dans **Environment**, avec `APP_URL=https://votre-instance.onrender.com`. Redéployer/redémarrer après modification. Le transfert reste interdit avec `NODE_ENV=production` : réserver la démonstration à une instance de test séparée (`NODE_ENV=test`, base et secrets distincts). En production, désactiver le transfert et utiliser un domaine vérifié.

Si l’envoi échoue, vérifier dans Resend la clé et son droit d’envoi, l’adresse autorisée avec `onboarding@resend.dev`, les quotas et le statut de la requête. Une réponse 403 signale notamment une restriction d’expéditeur/destinataire ou de permission ; 429 indique une limite de requêtes/quota. Les journaux serveur indiquent le statut HTTP et le code d’erreur, sans copier la réponse complète ni les liens de confirmation. Les erreurs supprimant le jeton nouvellement créé n’effacent pas le compte et ne suppriment pas ses anciens liens valides.

1. Créer un compte avec une adresse de test différente depuis `/signup`.
2. Vérifier que la connexion est refusée avant confirmation.
3. Ouvrir la boîte `MAIL_TEST_RECIPIENT`, y compris les indésirables. Le message indique le numéro du compte et l’adresse saisie à l’inscription.
4. Cliquer sur son lien : seul ce compte est confirmé, son adresse en base ne change pas.
5. Se connecter avec l’adresse saisie à l’inscription. Un second clic sur le lien doit être refusé. Les liens de confirmation expirent après 24 heures.
6. Pour un autre compte non confirmé, utiliser `/verify-email` pour renvoyer le lien. Les demandes sont limitées par le middleware existant.
7. Si Resend refuse l’envoi, le compte reste créé et non confirmé ; corriger la configuration, puis utiliser le renvoi. Ne pas recréer le compte. Une acceptation par Resend ne garantit pas la livraison en boîte de réception : consulter également son tableau de bord.

`MAIL_DRIVER=log` écrit uniquement dans `tmp/mail` en environnement non productif. Aucun message n’arrive dans une boîte réelle et le transfert de test n’est pas utilisé dans ce mode.

Le transfert ne concerne que les confirmations. Les liens de réinitialisation restent adressés au propriétaire réel de chaque compte ; avec l’expéditeur Resend de test, leur envoi à une autre adresse peut être refusé par Resend.

Le transfert ne prouve pas la possession de l’adresse saisie. Il est interdit avec `NODE_ENV=production` (démarrage refusé). Pour un site de test hébergé, utiliser une instance et une base isolées, identifiées comme environnement de test, avec leur URL HTTPS dans `APP_URL`. Ne pas convertir l’instance de production en mode développement.

En production, définir `MAIL_TEST_MODE=false`, `MAIL_DRIVER=resend`, `APP_URL=https://votre-site.example`, et un `MAIL_FROM` appartenant à un domaine vérifié dans Resend. Chaque confirmation est alors envoyée à l’adresse réelle du compte.

Les tests automatisés simulent l’API Resend et n’envoient aucun e-mail réel. La réception et la configuration DNS/du compte Resend restent à vérifier manuellement.
