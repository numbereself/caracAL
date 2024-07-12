/*
Credit to @thmsn
You rock!
*/

export {};
declare global {
  /** When you access parent via game code, this is what you have access to. */
  interface Window {
    /**
     * Contains an object if we are running the character in caracAL
     * https://github.com/numbereself/caracAL
     */
    caracAL?: {
      /**
       *
       * @param characterName
       * @param serverRealm
       * @param scriptPath
       * @example <caption>runs other char with script farm_snakes.js in current realm</caption>
       * parent.caracAL.deploy(another_char_name,null,"farm_snakes.js");
       * @example <caption>runs current char with current script in US 2</caption>
       * parent.caracAL.deploy(null,"USII");
       */
      deploy(
        characterName: string | null | undefined,
        serverRealm: string | null | undefined,
        scriptPath: string | null | undefined,
      ): void;

      /**
       * Shuts down the current character
       */
      shutdown(): void;

      /**
       * All the characters running in our current caracAL instance
       */
      siblings: string[];

      /**
       * load one or more additional scripts
       * @param scripts
       * @example <caption>get a promise for loading the script ./CODE/bonus_script.js</caption>
       * parent.caracAL.load_scripts(["bonus_script.js"])
       * .then(()=>console.log("the new script is loaded"));
       */
      load_scripts(scripts: string[]): Promise<void>;
    };
  }
}
