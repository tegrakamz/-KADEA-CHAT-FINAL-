# Vérification locale des dépendances

Audit du 20 octobre 2026 : `npm audit --omit=dev` signale 17 alertes élevées propagées depuis **une vulnérabilité de `braces` 3.0.3**, introduite par `@adonisjs/assembler → fast-glob → micromatch`.

Avis officiel : https://github.com/advisories/GHSA-vfj7-8cjw-p6xm (CVE-2026-93687). À la date du contrôle, aucune version corrigée n’est publiée ; le registre npm donne encore 3.0.3 comme dernière version.

Le correctif automatique proposé par npm implique notamment une rétrogradation d’AdonisJS vers la version 5, incompatible avec le sujet qui exige AdonisJS 7. Il n’a pas été appliqué. Aucun changement forcé de dépendance ou patch non officiel n’a été introduit.

Le code applicatif ne transmet pas les textes des utilisateurs à `braces`, `micromatch` ou `fast-glob`. Les motifs de fichiers utilisés par l’outillage sont définis dans le projet. Cela limite l’exposition identifiée, sans constituer une garantie d’absence de vulnérabilité dans toute la chaîne de dépendances.

Avant déploiement, relancer `npm audit --omit=dev`, surveiller les versions de `braces` et d’AdonisJS, appliquer un correctif compatible dès sa disponibilité et relancer les tests et la compilation. Ne pas exécuter `npm audit fix --force` sans examiner les changements de versions majeures.

Les secrets doivent rester dans `.env` ou l’environnement de l’hébergeur. Le contrôle local des fichiers candidats au commit n’a trouvé aucun fichier `.env` suivi et aucune clé Resend réelle dans les exemples ; les valeurs ressemblant à des clés dans les tests sont des simulations. Toute clé précédemment partagée doit être renouvelée auprès du fournisseur.
