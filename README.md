# Podman Desktop OpenShift Developer Sandbox Extension

This extension puts you to just few clicks away form deploying your application to [OpenShift Developer Sandbox](https://developers.redhat.com/developer-sandbox), a 30 days no cost shared cluster on [OpenShift](https://www.redhat.com/en/technologies/cloud-computing/openshift).
After few simple configuration steps the extension allows you to push an image to Sandbox internal image registry, so you can create and start containers from that image in OpenShift cluster using Podman Desktop UI.

# Usage

Once installed, you can find the Sandbox resource added to the Resources settings page.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/66387862-6f1d-4674-a19f-97510021ae15)

To configure kubernetes context for your Sandbox click on 'Create new ...' button to see Sandbox kubernetes context configuration form.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/e4094e32-fe84-4743-935e-0ba7b025d8d8)

Follow the description on top of the form to copy a login command from Sandbox Developer Console to `Login command from Developer Console` field. Then set desired kubernetes context name in corresponding field and press `Create` button.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/3435d8c6-d405-4b18-a555-b30d080e30eb)

There should be new Sandbox connection in 'running' state in Sandbox section after that.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/2c9d68bb-c4a4-4dcb-bc34-3abd215d502d)

To deploy your first application on OpenShift. Create `Containerfile` shown below

```
FROM --platform=linux/amd64 registry.access.redhat.com/ubi8/httpd-24:latest

LABEL org.opencontainers.image.title="Simple application with static content" \
        org.opencontainers.image.description="This is example of using Apache httpd 2.4 image to deploy web server with static content" \
        org.opencontainers.image.vendor="Red Hat"
```

Open Podman Desktop 'Build image' page and point `Containerfile path` to Containerfile above. Put `httpd-demo`
in `Image Name` field. Select `Intel and AMD x86_64` in platform section and press 'Build' button to build the image.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/a77bb9b2-bc70-43d4-885f-bada705acba9)

After build is done pres `Done` button to swithch to `Images` page.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/3f010889-198f-4863-8957-2e0dc811de6c)

In the Images page find `httpd-demo` image and select item `Push to Developer Sandbox cluster` to tag image with
Sandbox internal registry name and then push tagged image to the registry.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/45a156f7-da99-4891-a617-2443a41e816a)

After successfuly pushing the image to internal Sandbox image registry an information message with explanation should apperar.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/1a516a4c-6ce9-4cd2-8108-64a080315c77)

Close the message and run the image mentioned in it using run button on the right side of the image item.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/692ca1c0-5b9b-4535-a2c7-e5fcdb066be5)

In `Create Container` leave all default values and press `Start Container` button.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/1d7f9376-d96d-4e44-910c-26b511e156c5)

After container sucessfully started it can be deployed to kubernetes.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/2869eda6-10dd-4ef3-90fa-43efa6570ca7)

Make sure current kubernetes context is pointing to Sandbox and press `Deploy` button.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/a1d23ad8-5f7b-402e-84aa-1fad78431cd8)

After successful deployment application can be opened in browser.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/4f8d0609-69ab-4599-90f3-da7498ec7b49)

The browser window should show default test page for the running HTTPD server.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/d2bd5ed5-cc91-4ab1-8528-bb492000b7cd)

# Installation

You can install OpenShift Developer Sandbox Extension directly from Podman Desktop Extension page.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/cdd674d5-9386-45f2-abdf-0f389a703c65)


# Nightly Build Installation

Use 

`ghcr.io/redhat-developer/podman-desktop-sandbox-ext:latest`

on `Settings/Extension` page using 'Install a new extension from OCI Image' form (see screenshot below).

![image](https://user-images.githubusercontent.com/620330/232674304-5d72e8c5-f4cc-437d-8100-15ae1113fef2.png)
