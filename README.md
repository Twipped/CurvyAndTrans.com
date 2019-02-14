
Gulp.js Codebase for my [Curvy & Trans](https://www.curvyandtrans.com) Trans and Fashion blog.

This repo is on github mainly to serve as an offsite backup, but also because I'm rather proud of the gulp processes that I've constructed here and I want to be able to link to them.

Code for this blog is distributed as MIT licensed. You may duplicate and alter this blogging engine however you see fit, but must exclude the contents of the `posts` and `files` directories.

Blog content such as essays and photo materials are copyright Jocelyn Badgley, 2018-2019, and are *not* licensed for public redistribution.

---

## Usage

If you wish to re-used this blogging engine, download this repository and run `npm install` from inside the project root. You _must_ remove the contents of the `posts` folder, as this content is not licensed for reuse. You will also need to edit the `package.json` with the relevant site info.

**Commands:**

- `gulp new` creates a new post in the `posts` folder, based upon the template at `gulp/_template.js`
- `gulp clean` purges the contents of the docs folder, in preparation of a new site build.
- `gulp` runs a developer mode build of the site and then launches a local web server so you can test the site structure. This also launches a watch process which will rebuild site content upon changes in `templates`, `posts`, `scss` and `js` directories.
- `gulp prod` performs a production mode site build, enabling the cache busting functionalities.
- `gulp watch` launches the server and watch process so you can test whatever is currently in the `docs` folder.
- `gulp publish` runs a `gulp clean` and a `gulp prod` and then pushes the contents into an S3 bucket, setting up caching headers based on file patterns. See the AWS configuration section below.
- `gulp push` performs an S3 push of whatever is in the `docs` folder. Use at your own discrection.
- `gulp cloudfront` triggers a full site invalidation in the configured cloudfront distribution.

**Folders and Files:**

- `posts`: Every blog post goes into here, in its own folder. Each folder must contain an `index.md` file and at least a `1.jpeg` file to serve as the titlecard for the post. A `poster.jpeg` may also be provided to use on the site index and for oembed images. `titlecard.jpeg` may also be provided to override _just_ the oembed titlecard. Images or movies numbered in the pattern of `(N)N.(jpeg|jpg|gif|png)` will all automatically be scaled and inserted in the post. Numbered videos may also be provided in the format of `(N)N.m4v`, but must already be web-ready (no ffmpeg juju is performed). The `index.md` file is standard markdown, but supports inline HTML as well.

- `templates` contains the handlebars templates used for the site chrome, individual post pages, and the post cells on the index and tags pages.

- `pages` contains the handlebars templates for root level pages such as `index.html` and the `sitemap.xml` file. Handlebars is extended with helpers from the [Helper Hoard](http://npm.im/helper-hoard) js library (one of my own). Content regions define segments for embedding into the site chrome template. The `{{rev}}` helper is also provided to replace any asset paths with their respective cache busted urls.

- `scss` contains the site SCSS templates. Files prefixed with underscores are skipped by the build process, as those are just for imports. The build process converts these into standard CSS, minified when in production mode.

- `js` is any clientside javascript. The build process copies these into `docs/js`, and minifies them in production mode.

- `gulp` contains the gulp scripts used to build the site.

- `files` contains any raw files to be added to the root path. These will be cache-busted in production mode.

- `bs-cache` is generated by the `gulp images` process and contains a cache of the scaled results for all post images, enabling faster reconstruction of the site after a `gulp clean`.

- `bs-manifest.json` is a manifest archive of all of those results.

- `rev-manifest.json` is generated during a production build and is used to map source paths to cache busted paths. This is deleted by a `gulp clean`.

- `docs` this is the output of the build process, and is used for uploading to S3. If you are using this code to generate a Github Pages site, this will be your GHP source, and should be removed from `.gitignore`. The `gulp clean` process erases the entire contents of this folder.

- `docs/posts.json` is an index of all posts on the site, containing the post text, all metadata, a list of the numbered images, and various computed values. This is the file used when generating the site index.

## Configuring AWS

Create an `asw.json` file in the project root with the following structure:

```json
{
  "accessKeyId": "AWS IAM ACCOUNT ACCESS KEY",
  "secretAccessKey": "AWS IAM ACCOUNT SECRET KEY",
  "region": "us-east-1",
  "params": {
    "Bucket": "NAME OF THE S3 BUCKET FOR THE SITE"
  },
  "distribution": "CLOUDFRONT DISTRIBUTION ID"
}
```

The IAM account must have full access to the specified S3 bucket, and invalidation read/write access to cloudfront.
