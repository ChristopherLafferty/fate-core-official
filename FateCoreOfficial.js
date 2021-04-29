/**
 * The Fate Core game system for Foundry Virtual Tabletop
 * Author: Richard Bellingham, partially based on work by Nick van Oosten (NickEast)
 * Software License: GNU GPLv3
 * Content License:
 *      This work is based on Fate Core System and Fate Accelerated Edition (found at http://www.faterpg.com/),
 *      products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard,
 *      Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue,
 *      and licensed for our use under the Creative Commons Attribution 3.0 Unported license
 *      (http://creativecommons.org/licenses/by/3.0/).
 *
 *      This work is based on Fate Condensed (found at http://www.faterpg.com/), a product of Evil Hat Productions, LLC, 
 *      developed, authored, and edited by PK Sullivan, Ed Turner, Leonard Balsera, Fred Hicks, Richard Bellingham, Robert Hanz, Ryan Macklin, 
 *      and Sophie Lagacé, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).
 *
 * 
 * Note to self: New standardised hook signatures:
 * preCreate[documentName](document:Document, data:object, options:object, userId:string) {}
 * create[documentName](document:Document, options:object, userId: string) {}
 * preUpdate[documentName](document:Document, change:object, options:object, userId: string) {}
 * update[documentName](document:Document, change:object, options:object, userId: string) {}
 * preDelete[documentName](document:Document, options:object, userId: string) {}
 * delete[documentName](document:Document, options:object, userId: string) {}

 */

/* -------------------------------- */
/*	System initialization			*/
/* -------------------------------- */

import { FateCoreOfficialCharacter } from "./scripts/FateCoreOfficialCharacter.js"
import { ExtraSheet } from "./scripts/ExtraSheet.js"
import { Thing } from "./scripts/Thing.js"
import { FateCoreOfficialActor } from "./scripts/FateCoreOfficialActor.js"
import { FateCoreOfficialExtra } from "./scripts/FateCoreOfficialExtra.js"

Hooks.on("preCreateActor", async (actor, data, options, userId) => {
    console.log("Firing preCreateActor")

    if (actor.type == "Thing"){
        if (!options.thing){
            ui.notifications.error(game.i18n.localize("FateCoreOfficial.CantCreateThing"));
            return false;
        }
    }

    if (actor.type == "FateCoreOfficial"){
        if (game.user == game.users.find(e => e.isGM && e.active) || game.user.id === userId){
            if (actor?.data?.data?.details?.fatePoints?.refresh === ""){
                let modified_data = await initialiseFateCoreOfficialCharacter(actor);
                data.data = modified_data.data;            
            }
        }
    }

    if (actor.type == "ModularFate"){
        data.type = "FateCoreOfficial";
    }

});

async function initialiseFateCoreOfficialCharacter (actor) {

    //Modifies the data of the supplied actor to add tracks, aspects, etc. from system settings, then returns the data.
    let working_data = actor.data.toJSON();
    // Logic to set up Refresh and Current

    let refresh = game.settings.get("FateCoreOfficial", "refreshTotal");

    working_data.data.details.fatePoints.refresh = refresh;
    working_data.data.details.fatePoints.current = refresh;
    
    let p_skills=working_data.data.skills;
    
    //Check to see what skills the character has compared to the global skill list
        var skill_list = game.settings.get("FateCoreOfficial","skills");
        // This is the number of skills the character has currently.
        //We only need to add any skills if this is currently 0,
        
        
        let skills_to_add = [];

        for (let w in skill_list){
            let w_skill = skill_list[w];
            if (p_skills[w]!=undefined){
            } else {
                if(w_skill.pc){
                    skills_to_add.push(w_skill);
                }
            }
        }

        if (skills_to_add.length >0){
            //Add any skills from the global list that they don't have at rank 0.
            skills_to_add.forEach(skill => {
                skill.rank=0;
                p_skills[skill.name]=skill;
            })
        }        

        let aspects = game.settings.get("FateCoreOfficial", "aspects");
        let player_aspects = duplicate(aspects);
        for (let a in player_aspects) {
            player_aspects[a].value = "";
        }
        //Now to store the aspect list to the character
        working_data.data.aspects = player_aspects;
    
        //Step one, get the list of universal tracks.
        let world_tracks = duplicate(game.settings.get("FateCoreOfficial", "tracks"));
        let tracks_to_write = working_data.data.tracks;
        for (let t in world_tracks) {
            let track = world_tracks[t];
            if (track.universal == true) {
                tracks_to_write[t] = world_tracks[t];
            }
        }
        for (let t in tracks_to_write) {
            let track = tracks_to_write[t];
            //Add a notes field. This is a bit redundant for stress tracks,
            //but useful for aspects, indebted, etc. Maybe it's configurable whether we show the
            //notes or not for any given track. LATER NOTE: It is not.
            track.notes = "";

            //If this box is an aspect when marked, it needs an aspect.name data field.
            if (track.aspect == game.i18n.localize("FateCoreOfficial.DefinedWhenMarked")) {
                track.aspect = {};
                track.aspect.name = "";
                track.aspect.when_marked = true;
                track.aspect.as_name = false;
            }
            if (track.aspect == game.i18n.localize("FateCoreOfficial.AspectAsName")) {
                track.aspect = {};
                track.aspect.name = "";
                track.aspect.when_marked = true;
                track.aspect.as_name = false;
            }

            //Initialise the box array for this track 
            if (track.boxes > 0) {
                let box_values = [];
                for (let i = 0; i < track.boxes; i++) {
                    box_values.push(false);
                }
                track.box_values = box_values;
            }
        }
    working_data.data.tracks = tracks_to_write;
    let tracks = working_data.data.tracks;
    
    let categories = game.settings.get("FateCoreOfficial", "track_categories");
    //GO through all the tracks, find the ones with boxes, check the number of boxes and linked skills and initialise as necessary.
    for (let t in tracks) {
        let track = tracks[t];

        if (track.universal) {
            track.enabled = true;
        }

        // Check for linked skills and enable/add boxes as necessary.
        if (track.linked_skills != undefined && track.linked_skills.length > 0 && Object.keys(working_data.data.skills).length > 0) {
            let skills = working_data.data.skills;
            let linked_skills = tracks[t].linked_skills;
            let box_mod = 0;
            for (let i = 0; i < linked_skills.length; i++) {
                let l_skill = linked_skills[i].linked_skill;
                let l_skill_rank = linked_skills[i].rank;
                let l_boxes = linked_skills[i].boxes;
                let l_enables = linked_skills[i].enables;

                //Get the value of the player's skill
                if (working_data.data.skills[l_skill] == undefined){

                }else {
                    let skill_rank = working_data.data.skills[l_skill].rank;
                    //If this is 'enables' and the skill is too low, disable.
                    if (l_enables && skill_rank < l_skill_rank) {
                    track.enabled = false;
                }

                //If this adds boxes and the skill is high enough, add boxes if not already present.
                //Telling if the boxes are already present is the hard part.
                //If boxes.length > boxes it means we have added boxes, but how many? I think we need to store a count and add
                //or subract them at the end of our run through the linked skills.
                    if (l_boxes > 0 && skill_rank >= l_skill_rank) {
                        box_mod += l_boxes;
                    }
                }
            } //End of linked_skill iteration
            //Now to add or subtract the boxes

            //Only if this track works with boxes, though
            if (track.boxes > 0 || track.box_values != undefined) {
                //If boxes + box_mod is greater than box_values.length add boxes
                let toModify = track.boxes + box_mod - track.box_values.length;
                if (toModify > 0) {
                    for (let i = 0; i < toModify; i++) {
                        track.box_values.push(false);
                    }
                }
                //If boxes + box_mod is less than box_values.length subtract boxes.
                if (toModify < 0) {
                    for (let i = toModify; i < 0; i++) {
                        track.box_values.pop();
                    }
                }
            }
        }
    }
    return working_data;
}

Hooks.once('ready', async function () {
    //Convert any straggling ModularFate actors to FateCoreOfficial actors.
    let updates = [];
    game.actors.contents.forEach(actor => {
        if (actor.type == "ModularFate") updates.push({_id:actor.id, type:"FateCoreOfficial"})
    });
    await Actor.updateDocuments(updates)
                
    if (game.settings.get("FateCoreOfficial","run_once") == false){
        if (game.user.isGM){
            FateCoreOfficialConstants.awaitOKDialog(game.i18n.localize("FateCoreOfficial.WelcomeTitle"),game.i18n.localize("FateCoreOfficial.WelcomeText"),500,250);
            game.settings.set("FateCoreOfficial","run_once", true);
            console.log(game.i18n.localize("FateCoreOfficial.baseDefaults"));
            game.settings.set("FateCoreOfficial","defaults",game.i18n.localize("FateCoreOfficial.baseDefaults"))
        }
    }
})


// Needed to update with token name changes in FU.
Hooks.on('updateToken', (token, data, userId) => {
    if (data.hidden != undefined || data.actorData != undefined || data.flags != undefined || data.name!=undefined){
        game.system.apps["actor"].forEach(a=> {
            a.renderMe(token.id, data, token);
        })
    }
})

Hooks.on('controlToken', (token, control) => {
        game.system.apps["actor"].forEach (a=> {
            a.renderMe("controlToken",token.id, control);
    })
})


Hooks.on('updateUser',(...args) =>{
        game.system.apps["user"].forEach (a=> {
            a.renderMe("updateUser");
        })
})

Hooks.on('renderPlayerList',(...args) =>{
    game.system.apps["user"].forEach (a=> {
        a.renderMe("updateUser");
    })
})

Hooks.on('updateActor', (actor, data) => {
    game.system.apps["actor"].forEach(a=> {
        a.renderMe(actor.id, data, actor);
    })
})

Hooks.on('updateItem', (item, data) => {
    game.system.apps["item"].forEach(a=> {
        a.renderMe(item.id, data, item);
    })
})

Hooks.on('renderCombatTracker', () => {
    game.system.apps["combat"].forEach(a=> {
        a.renderMe("renderCombatTracker");
    })
})
Hooks.on('updateCombat', (...args) => {
    let ags = args;
    game.system.apps["combat"].forEach(a=> {
        a.renderMe(ags);
    })
})

Hooks.on('deleteCombat', (...args) => {
    game.system.apps["combat"].forEach(a=> {
        a.renderMe("deleteCombat");
    })
})

Hooks.on('deleteToken', (...args) => {
    game.system.apps["actor"].forEach(a=> {
        a.renderMe("deleteToken")
    })
})

Hooks.on('createToken', (...args) => {
    game.system.apps["actor"].forEach(a=> {
        a.renderMe("createToken");
    })
})

Hooks.on('updateScene', (...args) => {
    game.system.apps["combat"].forEach(a=> {
        a.renderMe(args);
    })
})

Hooks.once('init', async function () {
    CONFIG.Actor.documentClass = FateCoreOfficialActor;
    CONFIG.Item.documentClass = FateCoreOfficialExtra;
    CONFIG.fontFamilies.push("Montserrat");

    // Register a setting for replacing the existing skill list with one of the pre-defined default sets.
    game.settings.register("FateCoreOfficial", "defaultSkills", {
        name: game.i18n.localize("FateCoreOfficial.ReplaceSkills"),
        hint: game.i18n.localize("FateCoreOfficial.ReplaceSkillsHint"),
        scope: "world",     // This specifies a client-stored setting
        config: true,        // This specifies that the setting appears in the configuration view
        type: String,
        restricted:true,
        choices: {           // If choices are defined, the resulting setting will be a select menu
            "nothing":game.i18n.localize("FateCoreOfficial.No"),
            "fateCore":game.i18n.localize("FateCoreOfficial.YesFateCore"),
            "fateCondensed":game.i18n.localize("FateCoreOfficial.YesFateCondensed"),
            "accelerated":game.i18n.localize("FateCoreOfficial.YesFateAccelerated"),
            "dfa":game.i18n.localize("FateCoreOfficial.YesDFA"),
            "clearAll":game.i18n.localize("FateCoreOfficial.YesClearAll")
        },
        default: "nothing",        // The default value for the setting
        onChange: value => { // A callback function which triggers when the setting is changed
                if (value == "fateCore"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","skills",game.i18n.localize("FateCoreOfficial.FateCoreDefaultSkills"));
                        game.settings.set("FateCoreOfficial","defaultSkills","nothing");
                        game.settings.set("FateCoreOfficial","skillsLabel",game.i18n.localize("FateCoreOfficial.defaultSkillsLabel"));
                    }
                }
                if (value=="clearAll"){
                    if (game.user.isGM) {
                        game.settings.set("FateCoreOfficial","skills",{});
                        game.settings.set("FateCoreOfficial","skillsLabel",game.i18n.localize("FateCoreOfficial.defaultSkillsLabel"));
                    }
                }
                if (value=="fateCondensed"){
                    if (game.user.isGM){ 
                        game.settings.set("FateCoreOfficial","skills",game.i18n.localize("FateCoreOfficial.FateCondensedDefaultSkills"));
                        game.settings.set("FateCoreOfficial","defaultSkills","nothing");
                        game.settings.set("FateCoreOfficial","skillsLabel",game.i18n.localize("FateCoreOfficial.defaultSkillsLabel"));
                    }
                }
                if (value=="accelerated"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","skills",game.i18n.localize("FateCoreOfficial.FateAcceleratedDefaultSkills"));
                        game.settings.set("FateCoreOfficial","defaultSkills","nothing");
                        game.settings.set("FateCoreOfficial","skillsLabel",game.i18n.localize("FateCoreOfficial.FateAcceleratedSkillsLabel"));
                    }
                }
                if (value=="dfa"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","skills",game.i18n.localize("FateCoreOfficial.DresdenFilesAcceleratedDefaultSkills"));
                        game.settings.set("FateCoreOfficial","defaultSkills","nothing");
                        game.settings.set("FateCoreOfficial","skillsLabel",game.i18n.localize("FateCoreOfficial.FateAcceleratedSkillsLabel"));
                    }
                }
            }
    });

        // Register a setting for replacing the existing aspect list with one of the pre-defined default sets.
        game.settings.register("FateCoreOfficial", "defaultAspects", {
            name: game.i18n.localize("FateCoreOfficial.ReplaceAspectsName"),
            hint: game.i18n.localize("FateCoreOfficial.ReplaceAspectsHint"),
            scope: "world",     // This specifies a client-stored setting
            config: true,        // This specifies that the setting appears in the configuration view
            type: String,
            restricted:true,
            choices: {           // If choices are defined, the resulting setting will be a select menu
                "nothing":game.i18n.localize("No"),
                "fateCore":game.i18n.localize("FateCoreOfficial.YesFateCore"),
                "fateCondensed":game.i18n.localize("FateCoreOfficial.YesFateCondensed"),
                "accelerated":game.i18n.localize("FateCoreOfficial.YesFateAccelerated"),
                "dfa":game.i18n.localize("FateCoreOfficial.YesDFA"),
                "clearAll":game.i18n.localize("FateCoreOfficial.YesClearAll")
            },
            default: "nothing",        // The default value for the setting
            onChange: value => { // A callback function which triggers when the setting is changed
                    if (value == "fateCore"){
                        if (game.user.isGM){
                            game.settings.set("FateCoreOfficial","aspects",game.i18n.localize("FateCoreOfficial.FateCoreDefaultAspects"));
                            game.settings.set("FateCoreOfficial","defaultAspects","nothing");
                        }
                    }
                    if (value == "fateCondensed"){
                        if (game.user.isGM){
                            game.settings.set("FateCoreOfficial","aspects",game.i18n.localize("FateCoreOfficial.FateCondensedDefaultAspects"));
                            game.settings.set("FateCoreOfficial","defaultAspects","nothing");
                        }
                    }
                    if (value=="clearAll"){
                        if (game.user.isGM){
                            game.settings.set("FateCoreOfficial","aspects",{});
                            game.settings.set("FateCoreOfficial","defaultAspects","nothing");
                        }
                    }
                    if (value=="accelerated"){
                        if (game.user.isGM){
                            game.settings.set("FateCoreOfficial","aspects",game.i18n.localize("FateCoreOfficial.FateAcceleratedDefaultAspects"));
                            game.settings.set("FateCoreOfficial","defaultAspects","nothing");
                        }
                    }
                    if (value=="dfa"){
                        if (game.user.isGM){
                            game.settings.set("FateCoreOfficial","aspects",game.i18n.localize("FateCoreOfficial.DresdenFilesAcceleratedDefaultAspects"));
                            game.settings.set("FateCoreOfficial","defaultAspects","nothing");
                        }
                    }
                }
        });

    // Register a setting for replacing the existing track list with one of the pre-defined default sets.
    game.settings.register("FateCoreOfficial", "defaultTracks", {
        name: game.i18n.localize("FateCoreOfficial.ReplaceTracksName"),
        hint: game.i18n.localize("FateCoreOfficial.ReplaceTracksHint"),
        scope: "world",     // This specifies a client-stored setting
        config: true,        // This specifies that the setting appears in the configuration view
        type: String,
        restricted:true,
        choices: {           // If choices are defined, the resulting setting will be a select menu
            "nothing":game.i18n.localize("FateCoreOfficial.No"),
            "fateCore":game.i18n.localize("FateCoreOfficial.YesFateCore"),
            "fateCondensed":game.i18n.localize("FateCoreOfficial.YesFateCondensed"),
            "accelerated":game.i18n.localize("FateCoreOfficial.YesFateAccelerated"),
            "dfa":game.i18n.localize("FateCoreOfficial.YesDFA"),
            "clearAll":game.i18n.localize("FateCoreOfficial.YesClearAll")
        },
        default: "nothing",        // The default value for the setting
        onChange: value => { // A callback function which triggers when the setting is changed
                if (value == "fateCore"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","tracks",game.i18n.localize("FateCoreOfficial.FateCoreDefaultTracks"));
                        game.settings.set("FateCoreOfficial","defaultTracks","nothing");
                    }
                }
                if (value=="clearAll"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","tracks",{});
                        game.settings.set("FateCoreOfficial","defaultTracks","nothing");
                    }
                }
                if (value=="fateCondensed"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","tracks",game.i18n.localize("FateCoreOfficial.FateCondensedDefaultTracks"));
                        game.settings.set("FateCoreOfficial","defaultTracks","nothing");
                    }
                }
                if (value=="accelerated"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","tracks",game.i18n.localize("FateCoreOfficial.FateAcceleratedDefaultTracks"));
                        game.settings.set("FateCoreOfficial","defaultTracks","nothing");
                    }
                }
                if (value == "dfa"){
                    if (game.user.isGM){
                        game.settings.set("FateCoreOfficial","tracks",game.i18n.localize("FateCoreOfficial.DresdenFilesAcceleratedDefaultTracks"));
                        game.settings.set("FateCoreOfficial","track_categories",game.i18n.localize("FateCoreOfficial.DresdenFilesAcceleratedDefaultTrackCategories"));
                        game.settings.set("FateCoreOfficial","defaultTracks","nothing");
                    }
                }
            }
    });

    game.settings.register("FateCoreOfficial","exportSettings", {
        name: game.i18n.localize("FateCoreOfficial.ExportSettingsName"),
        scope:"world",
        config:true,
        type:Boolean,
        restricted:true,
        default:false,
        onChange: value => {
            if (value == true && game.user.isGM){
                let text = FateCoreOfficialConstants.exportSettings();
 
                new Dialog({
                    title: game.i18n.localize("FateCoreOfficial.ExportSettingsDialogTitle"), 
                    content: `<div style="background-color:white; color:black;"><textarea rows="20" style="font-family:Montserrat; width:382px; background-color:white; border:1px solid lightsteelblue; color:black;" id="export_settings">${text}</textarea></div>`,
                    buttons: {
                    },
                }).render(true);
                game.settings.set("FateCoreOfficial","exportSettings",false);
            }
        }
    })

    game.settings.register("FateCoreOfficial","importSettings", {
        name: game.i18n.localize("FateCoreOfficial.ImportSettingsName"),
        scope:"world",
        hint:game.i18n.localize("FateCoreOfficial.ImportSettingsHint"),
        config:true,
        type:Boolean,
        restricted:true,
        default:false,
        onChange: async value => {
            if (value == true && game.user.isGM){
                let text = await FateCoreOfficialConstants.getSettings();
                FateCoreOfficialConstants.importSettings(text);
                game.settings.set("FateCoreOfficial","importSettings",false);
            }
        }
    })

//Register a setting for the game's current Refresh total
game.settings.register("FateCoreOfficial", "refreshTotal", {
    name: game.i18n.localize("FateCoreOfficial.RefreshTotalName"),
    hint: game.i18n.localize("FateCoreOfficial.RefreshTotalHint"),
    scope: "world",
    config: true,
    type: Number,
    default:3,
    onChange: () =>{
        for (let app in ui.windows){
            if (ui.windows[app]?.object?.type == "Thing" || ui.windows[app]?.object?.type == "FateCoreOfficial"){
                ui.windows[app]?.render(false);
            }
        }
    }
});

game.settings.register("FateCoreOfficial","freeStunts", {
    name:game.i18n.localize("FateCoreOfficial.FreeStunts"),
    hint:game.i18n.localize("FateCoreOfficial.FreeStuntsHint"),
    scope:"world",
    config:true,
    type:Number,
    restricted:true,
    default:3,
    onChange: () =>{
        for (let app in ui.windows){
            if (ui.windows[app]?.object?.type == "Thing" || ui.windows[app]?.object?.type == "FateCoreOfficial"){
                ui.windows[app]?.render(false);
            }
        }
    }
})

      //Register a setting for the game's current skill total
      game.settings.register("FateCoreOfficial", "skillTotal", {
        name: game.i18n.localize("FateCoreOfficial.SkillPointTotal"),
        hint: game.i18n.localize("FateCoreOfficial.SkillPointTotalHint"),
        scope: "world",
        config: true,
        type: Number,
        restricted:true,
        default:20,
        onChange: () =>{
            for (let app in ui.windows){
                if (ui.windows[app]?.object?.type == "Thing" || ui.windows[app]?.object?.type == "FateCoreOfficial"){
                    ui.windows[app]?.render(false);
                }
            }
        }
    });

    game.settings.register("FateCoreOfficial","enforceSkillTotal", {
        name: game.i18n.localize("FateCoreOfficial.EnforceSkillTotal"),
        hint: game.i18n.localize("FateCoreOfficial.EnforceSkillTotalHint"),
        scope:"world",
        config:true,
        type: Boolean,
        restricted:true,
        default:true,
        onChange: () =>{
            for (let app in ui.windows){
                if (ui.windows[app]?.object?.type == "Thing" || ui.windows[app]?.object?.type == "FateCoreOfficial"){
                    ui.windows[app]?.render(false);
                }
            }
        }
    })

    game.settings.register("FateCoreOfficial","enforceColumn", {
        name: game.i18n.localize("FateCoreOfficial.EnforceColumn"),
        hint: game.i18n.localize("FateCoreOfficial.EnforceColumnHint"),
        scope:"world",
        config:true,
        type: Boolean,
        restricted:true,
        default:true,
        onChange: () =>{
            for (let app in ui.windows){
                if (ui.windows[app]?.object?.type == "Thing" || ui.windows[app]?.object?.type == "FateCoreOfficial"){
                    ui.windows[app]?.render(false);
                }
            }
        }
    })
    
    let skill_choices = {};
    let skills = game.settings.get("FateCoreOfficial", "skills")
    
    skill_choices["None"]="None";
    skill_choices["Disable"]="Disable";
    for (let skill in skills){skill_choices[skill]=skill};

    game.settings.register("FateCoreOfficial","init_skill", {
        name:game.i18n.localize("FateCoreOfficial.initiativeSkill"),
        hint:game.i18n.localize("FateCoreOfficial.initiativeSetting"),
        "scope":"world",
        "config":true,
        "restricted":true,
        type:String,
        default:"None",
        choices:skill_choices
    })

    game.settings.register("FateCoreOfficial","modifiedRollDefault", {
        name:game.i18n.localize("FateCoreOfficial.modifiedRollDefault"),
        hint:game.i18n.localize("FateCoreOfficial.modifiedRollDefaultExplainer"),
        scope:"world",
        config:"true",
        type:Boolean,
        default:false
    })

    game.settings.register("FateCoreOfficial","sheet_template", {
        name:game.i18n.localize("FateCoreOfficial.DefaultSheetTemplateName"),
        hint:game.i18n.localize("FateCoreOfficial.DefaultSheetTemplateHint"),
        scope:"world",
        config:"true",
        type:String,
        default:'systems/FateCoreOfficial/templates/FateCoreOfficialSheet.html'
    })
    

    game.settings.register("FateCoreOfficial","limited_sheet_template", {
        name:game.i18n.localize("FateCoreOfficial.DefaultLimitedSheetTemplateName"),
        hint:game.i18n.localize("FateCoreOfficial.DefaultLimitedSheetTemplateHint"),
        scope:"world",
        config:"true",
        type:String,
        default:'systems/FateCoreOfficial/templates/FateCoreOfficialSheet.html'
    })

    game.settings.register ("FateCoreOfficial","PlayerThings", {
        name:game.i18n.localize("FateCoreOfficial.AllowPlayerThingCreation"),
        label:game.i18n.localize("FateCoreOfficial.ThingCreationLabel"),
        hint:game.i18n.localize("FateCoreOfficial.ThingCreationHint"),
        type:Boolean,
        scope:"world",
        config:true,
        restricted:true,
        default:true
    });

    game.settings.register ("FateCoreOfficial","DeleteOnTransfer", {
        name:game.i18n.localize("FateCoreOfficial.DeleteOnTransfer"),
        label:game.i18n.localize("FateCoreOfficial.DeleteOnTransferLabel"),
        hint:game.i18n.localize("FateCoreOfficial.DeleteOnTransferHint"),
        type:Boolean,
        scope:"world",
        config:true,
        restricted:true,
        default:true
    });

    game.settings.register("FateCoreOfficial","confirmDeletion", {
        name: game.i18n.localize("FateCoreOfficial.ConfirmDeletionName"),
        hint:game.i18n.localize("FateCoreOfficial.ConfirmDeletionHint"),
        scope:"user",
        config:true,
        type:Boolean,
        restricted:false,
        default:false
    });

    game.settings.register("FateCoreOfficial","drawingsOnTop", {
        name:game.i18n.localize("FateCoreOfficial.DrawingsOnTop"),
        hint:game.i18n.localize("FateCoreOfficial.DrawingsOnTopHint"),
        scope:"world",
        config:"true",
        type:Boolean,
        default:false
    })

    game.settings.register("FateCoreOfficial","fu_actor_avatars", {
        name:"Use actor avatars instead of token avatars in Fate Utilities?",
        hint:"Whether to use actor avatars instead of token avatars in Fate Utilities' aspect viewer",
        scope:"world",
        config:false,
        default:false,
        type:Boolean
    })

    game.settings.register("FateCoreOfficial","fu_combatants_only", {
        name:"Display information only for combatants in the current 'encounter' rather than all tokens?",
        hint:"Toggle between display of all tokens or just active combatants in Fate Utilities",
        scope:"user",
        config:false,
        default:false,
        type:Boolean
    })

    game.settings.register("FateCoreOfficial", "run_once", {
        name: "Run Once?",
        hint:"Pops up a brief tutorial message on first load of a world with this system",
        scope:"world",
        config:false,
        type: Boolean,
        default:false
    })

    game.system.entityTypes.Item = ["Extra"];
    game.system.entityTypes.Actor = ["FateCoreOfficial","Thing", "ModularFate"]

    game.system.apps= {
        actor:[],
        combat:[],
        scene:[],
        user:[],
        item:[]
    }

    //On init, we initialise any settings and settings menus and HUD overrides as required.
    Actors.unregisterSheet('core', ActorSheet);
    Actors.registerSheet("FateCoreOfficial", FateCoreOfficialCharacter, { types: ["FateCoreOfficial", "ModularFate"], makeDefault: true, label:game.i18n.localize("FateCoreOfficial.FateCoreOfficialCharacter") });
    Actors.registerSheet("Thing" , Thing, {types: ["Thing"], label:game.i18n.localize("FateCoreOfficial.Thing")});

    // Register Item sheets
    Items.registerSheet('fate', ExtraSheet, { types: ['Extra'] });

    game.settings.register("FateCoreOfficial", "gameTime", {
        name: game.i18n.localize("FateCoreOfficial.GameTime"),
        scope:"world",
        config:false,
        type:String,
        restricted:true,
        default:""
    })
    
    game.settings.register("FateCoreOfficial", "gameNotes", {
        name: game.i18n.localize("FateCoreOfficial.GameNotes"),
        scope:"world",
        config:false,
        type:String,
        restricted:true,
        default:""
    })

    game.settings.register("FateCoreOfficial", "gameAspects", {
        name: game.i18n.localize("FateCoreOfficial.GameTime"),
        scope:"world",
        config:false,
        type:Object,
        restricted:true,
        default:[]
    })

    game.settings.register("FateCoreOfficial", "fuFontSize", {
        name: "Fate Utilities Font Size",
        scope:"user",
        config:false,
        type:Number,
        restricted:false,
        default:10 //Size in points (pt)
    })

    game.settings.register("FateCoreOfficial", "aspectwidth", {
        name: game.i18n.localize("FateCoreOfficial.aspectWidth"),
        hint: game.i18n.localize("FateCoreOfficial.AspectLabelWidth"),
        scope: "world",
        config: true,
        type: Number,
        range: {
            min: 5,
            max: 50,
            step: 1,
        },
        default:12
    });

    game.settings.register("FateCoreOfficial", "fuAspectLabelSize", {
        name: game.i18n.localize("FateCoreOfficial.fuAspectLabelSizeName"),
        hint:game.i18n.localize("FateCoreOfficial.fuAspectLabelSizeHint"),
        scope:"world",
        config:false,
        type:Number,
        restricted:true,
        default:0 
    })

    game.settings.register("FateCoreOfficial","fuAspectLabelFont", {
        name: game.i18n.localize("FateCoreOfficial.fuAspectLabelFont"),
        hint:game.i18n.localize("FateCoreOfficial.fuAspectLabelFontHint"),
        scope:"world",
        config:false,
        type:String,
        restricted:true,
        choices:CONFIG.fontFamilies,
        default:"Montserrat",
    })

    // Text colour
    game.settings.register("FateCoreOfficial","fuAspectLabelTextColour", {
        name: game.i18n.localize("FateCoreOfficial.fuAspectLabelTextColour"),
        hint:game.i18n.localize("FateCoreOfficial.fuAspectLabelTextColourHint"),
        scope:"world",
        config:false,
        type:String,
        restricted:true,
        default:"#000000",
    })

    //BG Colour
    game.settings.register("FateCoreOfficial","fuAspectLabelFillColour", {
        name: game.i18n.localize("FateCoreOfficial.fuAspectLabelFillColour"),
        hint:game.i18n.localize("FateCoreOfficial.fuAspectLabelFillColourHint"),
        scope:"world",
        config:false,
        restricted:true,
        type:String,
        restricted:true,
        default:"#FFFFFF"
    })

    // Border colour
    game.settings.register("FateCoreOfficial","fuAspectLabelBorderColour", {
        name: game.i18n.localize("FateCoreOfficial.fuAspectLabelBorderColour"),
        hint:game.i18n.localize("FateCoreOfficial.fuAspectLabelBorderColourHint"),
        scope:"world",
        config:false,
        restricted:true,
        type:String,
        restricted:true,
        default:"#000000"
    })

});

Combatant.prototype._getInitiativeFormula = function () {
    let init_skill = game.settings.get("FateCoreOfficial","init_skill");
    if (init_skill === "None" || init_skill === "Disable") {
        return "1d0";
    }else {
        return `1d0+${this.actor.data.data.skills[init_skill].rank}`;
    }
}

// Custom drawings layer with different z index
class CustomDrawingsLayer extends DrawingsLayer {
    static get layerOptions() {
        const options = super.layerOptions;
        options.zIndex = 350;
        return options;
    }
}

Hooks.on("init", () => {
    if (game.settings.get ("FateCoreOfficial", "drawingsOnTop")){
        // Force Canvas to use the new DrawingsLayer
        const existingLayers = Canvas.layers;
        existingLayers.drawings = CustomDrawingsLayer;
        Object.defineProperty(Canvas, "layers", { get: () => existingLayers });
    }
});

Hooks.on("getSceneControlButtons", (controls) => {
    if (game.settings.get ("FateCoreOfficial", "drawingsOnTop")){
        controls.find(c => c.name === "drawings").layer = "CustomDrawingsLayer";
    }
})

Handlebars.registerHelper("add1", function(value) {
    return value+1;
});

Handlebars.registerHelper("add5", function(value) {
    return value+5;
})

Handlebars.registerHelper("str", function(value) {
    return JSON.stringify(value);
});

Handlebars.registerHelper("concat", function(value1, value2){
    return value1.concat(value2);
});

Handlebars.registerHelper("category", function(category1, category2) {
    if (category1 == "All" || category1 == category2){
        return true;
    } else {
        return false;
    }
})

Handlebars.registerHelper("undefined", function(value) {
    if (value == undefined){
        return true;
    } else {
        return false;
    }
});

Handlebars.registerHelper("expanded", function (actor, item){
    let key;
    if (actor == "game"){
        key = "game"+item;
    } else {
        key = actor.id + item;
    }

    if (game.user.expanded != undefined){
        return game.user.expanded[key]==true;
    } else {
        return false;
    }
});

Handlebars.registerHelper("hasBoxes", function(track) {
    if(track.box_values==undefined || track.box_values.length==0){
        return false;
    } else {
        return true;
    }
});

