# Script Webflow de L’Affiche

`script.js` est la source. `script.min.js` est la version publiée utilisée par Webflow.
Les deux fichiers doivent être mis à jour ensemble : le fichier minifié est conservé
dans le dépôt pour éviter de dépendre du cache de minification automatique du CDN.

Pour régénérer la version minifiée :

```sh
npx --yes --package terser@5.44.0 terser script.js --compress --mangle --output script.min.js
```

Après publication, purger les deux URL jsDelivr et vérifier que `script.min.js`
contient bien la modification avant de confirmer sa disponibilité sur le site.

La photo des fondateurs utilise l’URL fixe définie dans `foundersImageUrl`.
Elle s’affiche après le texte de la première réponse sur les fondateurs, Suzanne,
Martin ou l’origine du projet. L’indicateur reste actif tant que la conversation
existe, y compris après fermeture du panneau ou troncature de son historique.
