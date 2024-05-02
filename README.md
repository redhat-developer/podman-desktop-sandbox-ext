# Podman Desktop OpenShift Developer Sandbox Extension

This extension puts you to just few clicks away form deploying your application to [OpenShift Developer Sandbox](https://developers.redhat.com/developer-sandbox), a 30 days no cost shared cluster on [OpenShift](https://www.redhat.com/en/technologies/cloud-computing/openshift).
After few simple configuration steps the extension allows you to push an image to Sandbox internal image registry, so you can create and start containers from that image in OpenShift cluster using Podman Desktop UI.

# Usage

Once installed, you can find the Sandbox resource added to the Settings page.

![image]()

To configure kubernetes context for your Sandbox click on 'Create new' button in Sandbox section and open [OpenShift Developer Sandbox](https://developers.redhat.com/developer-sandbox) page by clicking on '' button. 

![image]()


Create your Sandbox instance for free with a few simple steps, launch it and login into Sandbox Developer console. Once you are in, call context menu on your user name in upper right corner and select 'Copy login command' item to show page with login command. Copy login command in red square below. 

Switch back to Podman Desktop window and paste command to the '' field

![image]()

Fill in '' field and press '' button.

![image]()

You will see new Sandbox connection in 'running' state in Sandbox section.

!()[]

You are ready now to deploy your first application on OpenShift.

Pull the '' image using Podman Desktop 'Pull image' page

!()[]

Push it to Sandbox using image context menu

![]()

Start container from the image using '' page

![]()

Deploy it to Sandbox cluster using '' page

![]()

Once pod is up an running click on the link shown below

![]()

You application is up an running

!()[]

# Installation

You can install OpenShift Developer Sandbox Extension directly from Podman Desktop Extension page.

![image](https://github.com/dgolovin/podman-desktop-sandbox-ext/assets/620330/cdd674d5-9386-45f2-abdf-0f389a703c65)


# Nightly Build Installation

Use 

`ghcr.io/redhat-developer/podman-desktop-sandbox-ext:latest`

on `Settings/Extension` page using 'Install a new extension from OCI Image' form (see screenshot below).

![image](https://user-images.githubusercontent.com/620330/232674304-5d72e8c5-f4cc-437d-8100-15ae1113fef2.png)
