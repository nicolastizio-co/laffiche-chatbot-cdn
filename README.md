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

La migration des cartes vers une page dédiée `/chatbot-cartes` est décrite dans
[WEBFLOW.md](WEBFLOW.md). Elle nécessite de supprimer le catalogue caché du
composant partagé dans Webflow : publier le JavaScript seul ne retire pas le HTML.
L'attribut `data-ai-search-catalog-url="/chatbot-cartes"` sélectionne la source
dédiée. Les cartes sont préparées dès l'envoi de la question, avec deux requêtes
maximum à la fois, puis mises en cache sous forme de texte. Les explications
n'attendent pas leur chargement. Aucun catalogue n'est chargé au repos ou au scroll.

Tests du chargement à la demande (Playwright et Chrome requis) :

```sh
node --test tests/lazy-cards.test.cjs
```

La photo des fondateurs utilise l’URL fixe définie dans `foundersImageUrl`.
Elle s’affiche après le texte de la première réponse sur les fondateurs, Suzanne,
Martin ou l’origine du projet. L’indicateur reste actif tant que la conversation
existe, y compris après fermeture du panneau ou troncature de son historique.
