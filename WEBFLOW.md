# Cartes chargées à la demande — migration du 10 novembre 2026

Le script corrigé fonctionne avec une page dédiée `/chatbot-cartes`, sur le même domaine que le site. Il commence à préparer les cartes dès l'envoi d'une question, pendant l'attente du webhook, avec deux requêtes maximum à la fois. Le repos, le scroll et le focus ne chargent pas le catalogue. À la réception de la réponse, la préparation spéculative s'arrête ; seules les cartes nécessaires sont encore recherchées. Les requêtes déjà parties peuvent se terminer, y compris pour une réponse sans cartes.

La correction complète nécessite de retirer la collection de cartes du HTML des pages ordinaires. Mettre son affichage sur `none`, masquer une instance du composant ou désactiver seulement son script ne suffit pas.

## 1. Créer la page qui fournit les cartes

Dans Webflow, créer une **page statique vide** avec le slug `chatbot-cartes`.

- Copier le bloc complet portant l'attribut `data-ai-search-swiper-source` depuis le composant actuel. C'est le bloc caché qui contient la Collection List de spectacles et son Swiper.
- Le coller sur cette page en **élément indépendant du composant chatbot partagé**. Si nécessaire, détacher une copie du composant, en extraire ce bloc, puis supprimer le reste de la copie.
- Ne pas mettre le chatbot complet ni la liste de recherche Finsweet sur cette page.
- Garder les liaisons CMS et les filtres existants des cartes. Garder au maximum **100 éléments par page** et activer la **pagination native Webflow**, avec son lien « Next » à l'intérieur du bloc source. Ne pas utiliser Finsweet Load All ou Infinite pour cette source : ses scripts ne sont pas exécutés lorsque le HTML est récupéré par le chatbot.
- Garder les classes de cartes, titres, liens et identifiants existants : elles permettent de retrouver le spectacle demandé par n8n et de conserver son apparence.

Structure nécessaire, à conserver depuis le bloc existant :

```text
Bloc [data-ai-search-swiper-source]
  Groupe [data-swiper-group]
    Conteneur [data-swiper-wrap]
      Collection List .swiper-wrapper.w-dyn-items
        Collection Item .swiper-slide
          Carte du spectacle, titre, lien /spectacles/..., identifiants existants
    Boutons [data-swiper-prev] et [data-swiper-next]
    Pagination visuelle du carrousel .swiper-pagination, si présente
  Pagination CMS native Webflow avec lien .w-pagination-next
```

La pagination CMS est distincte des petits points du carrousel. Le lien Next doit rester **dans** le bloc `data-ai-search-swiper-source`, même si le bloc est masqué en CSS. L'attribut optionnel `data-ai-search-catalog-next` peut être conservé sur ce lien s'il y est déjà.

Rendre cette page publique, sans mot de passe, mais désactiver son indexation et sa présence dans le sitemap via les réglages Webflow. Si besoin, ajouter dans le Head de cette page :

```html
<meta name="robots" content="noindex, follow">
```

Le CSS global masque le bloc source : une page visuellement vide est normale. Le HTML publié doit néanmoins contenir les cartes. Cette page sert uniquement à fournir leurs modèles au script.

## 2. Alléger le composant chatbot partagé

Après avoir conservé le bloc source sur `/chatbot-cartes` :

- **Supprimer réellement** le bloc `[data-ai-search-swiper-source]` du composant chatbot partagé. Ne pas seulement le masquer.
- Faire la même suppression dans les éventuelles copies indépendantes du chatbot. Le catalogue ne doit plus être présent dans les pages spectacles, `/les-spectacles`, l'accueil ou les autres pages ordinaires.
- Conserver le conteneur `[data-ai-search]`, les modèles de messages question/réponse, le fil, le formulaire, les suggestions et les boutons. Le script reconstruit le carrousel de réponse depuis la page dédiée.
- Sur le conteneur qui possède déjà `data-ai-search`, ajouter cet attribut :

| Nom | Valeur |
| --- | --- |
| `data-ai-search-catalog-url` | `/chatbot-cartes` |

Utiliser le chemin relatif : il fonctionnera sur le domaine de staging et sur le domaine public. Si un autre slug est choisi, adapter la valeur. Les sources et les liens de pagination sur un autre domaine ne sont pas suivis.

## 3. Script et styles

Garder une seule inclusion du script global, dans le Footer :

```html
<script src="https://cdn.jsdelivr.net/gh/nicolastizio-co/laffiche-chatbot-cdn@main/script.min.js"></script>
```

Garder le CSS du chatbot ainsi que le CSS et le JS Swiper déjà installés. Aucun changement n8n ni changement du script de filtrage Finsweet n'est requis par cette migration.

Le nouveau script reste compatible avec l'ancienne source embarquée tant qu'aucune URL dédiée n'est configurée. Cette compatibilité évite de casser les autres pages pendant la migration, mais **ne corrige pas leur surcharge HTML**. La suppression du bloc source sur toutes les pages ordinaires reste nécessaire.

## 4. Publier puis réactiver

1. Publier d'abord la page dédiée et le composant allégé sur le domaine de staging.
2. Réactiver le chatbot allégé sur `/les-spectacles` et sur les fiches où il a été désactivé.
3. Tester sur l'iPhone 14 : chargement, scroll continu, filtres, ouverture/fermeture, une recommandation, une deuxième question et retour depuis une fiche.
4. Vérifier qu'une recommandation trouve aussi un spectacle situé après les 100 premiers éléments de la source.
5. Publier les changements sur le domaine public après cette vérification. Publier aussi les pages CMS et les autres pages affectées par le composant partagé, pas uniquement `/les-spectacles`.

## Comportement et limites

- Pendant l'attente du webhook, les pages sont préparées par lots de deux au maximum. Les requêtes partagées sont dédupliquées. Une fois la réponse reçue, la recherche s'arrête dès que les cartes demandées sont trouvées ; au plus deux requêtes déjà lancées peuvent encore se terminer.
- Les explications et la conclusion n'attendent plus le carrousel. Celui-ci apparaît à sa place, au-dessus des explications, dès que ses cartes sont disponibles.
- Les cartes déjà lues sont réutilisées pendant la conversation. Le cache conserve leur HTML sous forme de texte et une structure de carrousel vide, pas les documents complets téléchargés.
- La limite est de 20 pages de catalogue par instance du chatbot, avec une préparation de 20 secondes maximum pendant le webhook, puis 20 secondes maximum de recherche de cartes après la réponse. Avec 100 cartes par page, la capacité normale est de 2 000 cartes maximum. Une réponse peut parcourir plusieurs lots pour trouver une carte éloignée ; ce n'est pas une API de recherche unitaire.
- Une page inaccessible ou une carte absente laisse les explications et les liens de spectacles disponibles. Un échec réseau peut être réessayé à la question suivante.
- Le chargement à la demande a été testé dans Chromium avec réponses n8n simulées. La disparition du crash sur Safari iOS doit être confirmée après publication du HTML allégé sur l'iPhone réel.

Le retrait expérimental du catalogue seul ne doit pas être utilisé avec l'ancien script : celui-ci ne sait pas charger les modèles depuis la nouvelle page.
